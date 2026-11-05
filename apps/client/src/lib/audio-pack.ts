/**
 * Optional audio pack: downloaded on request, extracted clip by clip into IndexedDB, played
 * before any TTS fallback. Keys are the exact voiced text (see @lm/content-tools audioKey).
 */
import { audioKey, type PackManifest } from "@lm/content-tools";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { db } from "@/db/db";
import { fetchManifest, reportPackFailure } from "./dict-pack";

export type AudioState =
  | { status: "none"; available: boolean; bytes?: number }
  | { status: "downloading"; received: number; total: number }
  | { status: "extracting"; done: number; total: number }
  | { status: "ready"; version: number; clips: number }
  | { status: "error"; message: string };

type Listener = (s: AudioState) => void;
const listeners = new Set<Listener>();
let state: AudioState = { status: "none", available: false };
let sql: SqlJsStatic | null = null;
const KEY = "lm.audio.installed";

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

/** At launch: report installed clips, and whether the manifest offers an audio pack. */
export async function initAudio(target = "es", native = "de"): Promise<void> {
  const installed = localStorage.getItem(KEY);
  if (installed) {
    const clips = await db.audioClips.count();
    if (clips > 0) {
      set({ status: "ready", version: Number(installed), clips });
      return;
    }
  }
  const m = await fetchManifest(target, native);
  set({ status: "none", available: !!m?.with_audio, bytes: m?.audio_bytes });
}

export async function installAudio(target = "es", native = "de"): Promise<void> {
  const m = await fetchManifest(target, native);
  if (!m?.with_audio || !m.audio_url) {
    set({ status: "error", message: "Kein Audiopaket verfügbar." });
    return;
  }
  try {
    const total = m.audio_bytes ?? 0;
    set({ status: "downloading", received: 0, total });
    const res = await fetch(m.audio_url).catch(() => {
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
      set({ status: "downloading", received, total });
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
        set({ status: "extracting", done, total: n });
      }
    }
    if (batch.length) {
      await db.audioClips.bulkPut(batch);
      done += batch.length;
    }
    stmt.free();
    database.close();
    localStorage.setItem(KEY, String(m.version));
    set({ status: "ready", version: m.version, clips: done });
  } catch (e) {
    set({ status: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

export async function removeAudio(): Promise<void> {
  await db.audioClips.clear();
  localStorage.removeItem(KEY);
  const m = await fetchManifest();
  set({ status: "none", available: !!m?.with_audio, bytes: m?.audio_bytes });
}

const urlCache = new Map<string, string>();

/** Play a stored clip for this text; resolves false when none exists. */
export async function playClip(text: string): Promise<boolean> {
  if (state.status !== "ready") return false;
  const key = audioKey(text);
  let url = urlCache.get(key);
  if (!url) {
    const row = await db.audioClips.get(key);
    if (!row) return false;
    url = URL.createObjectURL(new Blob([row.bytes as BlobPart], { type: row.mime }));
    urlCache.set(key, url);
  }
  try {
    const a = new Audio(url);
    await a.play();
    return true;
  } catch {
    return false;
  }
}
