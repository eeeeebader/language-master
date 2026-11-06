/**
 * Audio packs: the core pack (frequent headwords, lectures, official stories) installs itself in
 * the background after the dictionary; the full pack (every headword) is an opt-in download.
 * Clips are extracted into IndexedDB and played before any TTS fallback. Keys are the exact
 * voiced text (see @lm/content-tools audioKey).
 */
import { type AudioTier, audioKey, type PackManifest } from "@lm/content-tools";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { type AudioClipRow, db } from "@/db/db";
import { API_URL } from "./auth";
import { fetchManifest, reportPackFailure } from "./dict-pack";

export type AudioState =
  | { status: "none"; available: boolean; bytes?: number }
  | { status: "downloading"; tier: AudioTier; received: number; total: number }
  | { status: "extracting"; tier: AudioTier; done: number; total: number }
  | { status: "ready"; tier: AudioTier; version: number; clips: number; fullBytes?: number }
  | { status: "error"; message: string };

type Listener = (s: AudioState) => void;
const listeners = new Set<Listener>();
let state: AudioState = { status: "none", available: false };
let sql: SqlJsStatic | null = null;
const KEY = "lm.audio.installed";
const TIER_KEY = "lm.audio.tier";

function installedTier(): AudioTier {
  return localStorage.getItem(TIER_KEY) === "full" ? "full" : "core";
}

function packOf(m: PackManifest, tier: AudioTier) {
  return tier === "full"
    ? { url: m.audio_full_url, bytes: m.audio_full_bytes }
    : { url: m.audio_url, bytes: m.audio_bytes };
}

function set(s: AudioState) {
  state = s;
  for (const l of listeners) l(s);
}
export function onAudioState(cb: Listener): () => void {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}
export function audioState(): AudioState {
  return state;
}

/**
 * At launch: report the installed pack, then fetch the manifest and install the core pack (or
 * update the installed tier) in the background when the server has a newer one.
 */
export async function initAudio(target = "es", native = "de"): Promise<void> {
  const installed = Number(localStorage.getItem(KEY) ?? 0);
  const tier = installedTier();
  let have = false;
  if (installed) {
    const clips = await db.audioClips.count();
    if (clips > 0) {
      have = true;
      set({ status: "ready", tier, version: installed, clips });
    }
  }
  const m = await fetchManifest(target, native);
  if (!m?.with_audio || !m.audio_url) {
    if (!have) set({ status: "none", available: false });
    return;
  }
  if (have) {
    set({
      status: "ready",
      tier,
      version: installed,
      clips: await db.audioClips.count(),
      fullBytes: m.audio_full_bytes,
    });
    if (m.version > installed && packOf(m, tier).url) await installAudio(tier, target, native);
    return;
  }
  await installAudio("core", target, native);
}

export async function installAudio(
  tier: AudioTier = "core",
  target = "es",
  native = "de",
): Promise<void> {
  const m = await fetchManifest(target, native);
  const pack = m?.with_audio ? packOf(m, tier) : undefined;
  if (!m || !pack?.url) {
    set({ status: "error", message: "Kein Audiopaket verfügbar." });
    return;
  }
  try {
    const total = pack.bytes ?? 0;
    set({ status: "downloading", tier, received: 0, total });
    const res = await fetch(pack.url).catch(() => {
      reportPackFailure("audio", "network");
      throw new Error("download failed (network)");
    });
    if (!res.ok || !res.body) {
      reportPackFailure("audio", "http");
      throw new Error(`download failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      set({ status: "downloading", tier, received, total });
    }
    const bytes = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.length;
    }
    sql ??= await initSqlJs({ locateFile: () => sqlWasmUrl });
    const database = new sql.Database(bytes);
    const n = Number(database.exec("SELECT count(*) FROM audio")[0]?.values[0]?.[0] ?? 0);
    const stmt = database.prepare("SELECT key, mime, bytes FROM audio");
    let done = 0;
    let batch: { key: string; mime: string; bytes: Uint8Array }[] = [];
    await db.audioClips.clear();
    while (stmt.step()) {
      const row = stmt.getAsObject() as { key: string; mime: string; bytes: Uint8Array };
      batch.push({ key: row.key, mime: row.mime, bytes: row.bytes });
      if (batch.length === 200) {
        await db.audioClips.bulkPut(batch);
        done += batch.length;
        batch = [];
        set({ status: "extracting", tier, done, total: n });
      }
    }
    if (batch.length) {
      await db.audioClips.bulkPut(batch);
      done += batch.length;
    }
    stmt.free();
    database.close();
    localStorage.setItem(KEY, String(m.version));
    localStorage.setItem(TIER_KEY, tier);
    set({ status: "ready", tier, version: m.version, clips: done, fullBytes: m.audio_full_bytes });
  } catch (e) {
    set({ status: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

/** Drop the full pack and go back to the core pack. */
export async function removeFullAudio(): Promise<void> {
  await installAudio("core");
}

/** Clips a story brought along (generated stories ship their own words and sentences). */
export async function storeClips(
  clips: { key: string; mime: string; b64: string }[],
): Promise<void> {
  if (clips.length === 0) return;
  const rows: AudioClipRow[] = clips.map((c) => ({
    key: audioKey(c.key),
    mime: c.mime,
    bytes: Uint8Array.from(atob(c.b64), (ch) => ch.charCodeAt(0)),
  }));
  await db.audioClips.bulkPut(rows).catch(() => undefined);
}

const urlCache = new Map<string, string>();

/** Texts outside the pack are rendered by the server once and kept locally like pack clips. */
async function fetchClip(key: string): Promise<AudioClipRow | null> {
  if (!API_URL || !navigator.onLine || key.length > 400) return null;
  const res = await fetch(`${API_URL}/packs/tts?text=${encodeURIComponent(key)}`).catch(() => null);
  if (!res?.ok) return null;
  const row: AudioClipRow = {
    key,
    mime: res.headers.get("content-type") ?? "audio/wav",
    bytes: new Uint8Array(await res.arrayBuffer()),
  };
  await db.audioClips.put(row).catch(() => undefined);
  return row;
}

/** Play a stored clip for this text; resolves false when none exists. */
let currentAudio: HTMLAudioElement | null = null;

/** Play a clip; resolves once playback starts, or after it ends with `wait`. */
export async function playClip(text: string, wait = false): Promise<boolean> {
  const key = audioKey(text);
  let url = urlCache.get(key);
  if (!url) {
    const row = (await db.audioClips.get(key)) ?? (await fetchClip(key));
    if (!row) return false;
    url = URL.createObjectURL(new Blob([row.bytes as BlobPart], { type: row.mime }));
    urlCache.set(key, url);
  }
  try {
    stopClip();
    const a = new Audio(url);
    currentAudio = a;
    await a.play();
    if (wait)
      await new Promise<void>((res) => a.addEventListener("ended", () => res(), { once: true }));
    return true;
  } catch {
    return false;
  }
}

export function stopClip() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Whether a clip for the text is stored locally (no network). */
export async function hasClip(text: string): Promise<boolean> {
  return !!(await db.audioClips.get(audioKey(text)));
}
