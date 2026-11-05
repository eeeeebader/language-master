/**
 * Dictionary pack lifecycle on the device: manifest check, download with progress, storage in
 * IndexedDB (Dexie), and an in-memory SQLite (sql.js) handle for the query layer.
 *
 * The plan names wa-sqlite over OPFS; v1 uses sql.js because the Spanish pack is a few MB and
 * sql.js offers the synchronous API the shared DictClient expects. Audio stays outside the pack.
 */
import { DictClient, type PackManifest, type SqliteLike } from "@lm/content-tools";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { db } from "@/db/db";
import { API_URL } from "./auth";
import { track } from "./telemetry";

export type PackState =
  | { status: "none" }
  | { status: "checking" }
  | { status: "downloading"; received: number; total: number }
  | { status: "ready"; version: number; lemmas: number }
  | { status: "error"; message: string };

type Listener = (s: PackState) => void;
const listeners = new Set<Listener>();
let state: PackState = { status: "none" };
let client: DictClient | null = null;
let sql: SqlJsStatic | null = null;

function set(s: PackState) {
  state = s;
  for (const l of listeners) l(s);
}

export function onPackState(cb: Listener): () => void {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function packState(): PackState {
  return state;
}

/** The active pack's query client, or null while the bundled seed is in use. */
export function dictClient(): DictClient | null {
  return client;
}

const packKey = (target: string, native: string) => `${target}-${native}`;

function wrap(database: Database): SqliteLike {
  return {
    exec: (q) => {
      database.exec(q);
    },
    run: (q, params = []) => {
      database.run(q, params as never[]);
    },
    all: <T>(q: string, params: unknown[] = []) => {
      const stmt = database.prepare(q);
      stmt.bind(params as never[]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    },
  };
}

async function openBytes(bytes: Uint8Array, version: number) {
  sql ??= await initSqlJs({ locateFile: () => sqlWasmUrl });
  const database = new sql.Database(bytes);
  const c = new DictClient(wrap(database));
  const lemmas = Number(
    wrap(database).all<{ n: number }>("SELECT count(*) AS n FROM lemma")[0]?.n ?? 0,
  );
  client = c;
  set({ status: "ready", version, lemmas });
}

/** Open the stored pack if one exists; call once at app start. */
export async function loadInstalledPack(target = "es", native = "de"): Promise<boolean> {
  const row = await db.packFiles.get(packKey(target, native));
  if (!row) return false;
  try {
    await openBytes(row.bytes, row.version);
    return true;
  } catch (e) {
    set({ status: "error", message: String(e) });
    return false;
  }
}

/** Tell the API about a failed download so the dashboard can show it; best effort. */
export function reportPackFailure(
  kind: "dictionary" | "audio",
  reason: "network" | "http" | "checksum" | "storage" | "open",
) {
  if (!API_URL) return;
  fetch(`${API_URL}/packs/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, reason }),
    keepalive: true,
  }).catch(() => undefined);
}

export async function fetchManifest(target = "es", native = "de"): Promise<PackManifest | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/packs/manifest?target=${target}&native=${native}`, {
      cache: "no-cache",
    });
    if (!res.ok) return null;
    return (await res.json()) as PackManifest;
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Download a pack with progress, verify the checksum, store it and open it. */
export async function installPack(manifest: PackManifest): Promise<void> {
  set({ status: "downloading", received: 0, total: manifest.bytes });
  try {
    const res = await fetch(manifest.url).catch(() => {
      reportPackFailure("dictionary", "network");
      throw new Error("download failed (network)");
    });
    if (!res.ok || !res.body) {
      reportPackFailure("dictionary", "http");
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
      set({ status: "downloading", received, total: manifest.bytes });
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const hash = await sha256Hex(bytes);
    if (hash !== manifest.sha256) {
      reportPackFailure("dictionary", "checksum");
      throw new Error("checksum mismatch");
    }
    await db.packFiles.put({
      key: packKey(manifest.target, manifest.native),
      version: manifest.version,
      bytes,
      sha256: hash,
      installedAt: new Date().toISOString(),
    });
    await openBytes(bytes, manifest.version);
    track("pack_installed", { kind: "dictionary", version: manifest.version });
  } catch (e) {
    set({ status: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

/** Launch routine: open the installed pack, then fetch the manifest and update when newer. */
export async function ensurePack(target = "es", native = "de"): Promise<void> {
  const had = await loadInstalledPack(target, native);
  const installed = had ? await db.packFiles.get(packKey(target, native)) : undefined;
  if (!had) set({ status: "checking" });
  const manifest = await fetchManifest(target, native);
  if (!manifest) {
    if (!had) set({ status: "none" });
    return;
  }
  if (!installed || installed.version < manifest.version) await installPack(manifest);
}

export async function removePack(target = "es", native = "de") {
  await db.packFiles.delete(packKey(target, native));
  client = null;
  set({ status: "none" });
}
