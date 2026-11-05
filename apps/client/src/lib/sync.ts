import type { ReviewEvent, StoryDocument } from "@lm/schema";
import { replay } from "@lm/srs";
import { db } from "@/db/db";
import { API_URL, getAccessToken, isCloudEnabled } from "./auth";

/**
 * Outbox sync. Events are immutable and pushed by ulid (idempotent); lists, words, variants,
 * sentences, story metadata and settings are last-writer-wins by updatedAt. The pull cursor is
 * stored per device in localStorage. Everything is a no-op in local-only mode.
 */

const CURSOR_KEY = "lm.sync.cursor";
const EVENT_CURSOR_KEY = "lm.sync.eventCursor";
const LAST_KEY = "lm.sync.lastAt";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage optional */
  }
}

let inFlight: Promise<void> | null = null;
const listeners = new Set<(s: SyncStatus) => void>();
export type SyncStatus = {
  state: "idle" | "syncing" | "error" | "local";
  lastAt: string | null;
  error?: string;
};
let status: SyncStatus = { state: isCloudEnabled ? "idle" : "local", lastAt: get(LAST_KEY) };

function emit(s: SyncStatus) {
  status = s;
  for (const l of listeners) l(s);
}
export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb);
  cb(status);
  return () => listeners.delete(cb);
}

async function api(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("not signed in");
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function push() {
  // `synced` is a boolean, which IndexedDB cannot index, so this is a filter scan (fine for < 50 k events).
  const events = await db.events.filter((e) => !e.synced).toArray();
  const since = get(LAST_KEY) ?? "1970-01-01T00:00:00.000Z";
  const [words, variants, sentences, lists, listWords, stories, settings] = await Promise.all([
    db.words.filter((w) => w.updatedAt > since).toArray(),
    db.variants.filter((v) => v.createdAt > since).toArray(),
    db.sentences.toArray(),
    db.lists.filter((l) => l.updatedAt > since).toArray(),
    db.listWords.filter((lw) => lw.addedAt > since).toArray(),
    db.stories.filter((s) => s.source === "ai").toArray(),
    db.settings.get("me"),
  ]);
  const body = {
    events: events.map(({ synced: _s, ...e }) => e),
    words: words.map((w) => ({ ...w })),
    variants: variants.map((v) => ({ ...v, updatedAt: v.createdAt, deletedAt: null })),
    sentences: sentences.map((s) => ({ ...s, updatedAt: since, deletedAt: null })),
    lists,
    listWords: listWords.map((lw) => ({ ...lw, deletedAt: null })),
    stories: stories.map((s) => ({
      id: s.id,
      updatedAt: s.createdAt,
      deletedAt: null,
      archived: s.archived,
    })),
    settings: settings
      ? {
          id: "me",
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          soundOn: settings.soundOn,
          hapticsOn: settings.hapticsOn,
          dailyNewCards: settings.dailyNewCards,
          learningDays: settings.learningDays,
          vacationUntil: settings.vacationUntil,
        }
      : null,
  };
  const res = (await api("/sync/push", { method: "POST", body: JSON.stringify(body) })) as {
    acceptedEventIds: string[];
    duplicateEventIds: string[];
  };
  const done = [...res.acceptedEventIds, ...res.duplicateEventIds];
  if (done.length) await db.events.where("id").anyOf(done).modify({ synced: true });
}

async function pull() {
  const since = get(CURSOR_KEY) ?? "";
  const data = (await api(`/sync/pull?since=${encodeURIComponent(since)}`)) as {
    cursor: string;
    words: Array<Record<string, unknown>>;
    variants: Array<Record<string, unknown>>;
    sentences: Array<Record<string, unknown>>;
    lists: Array<Record<string, unknown>>;
    listWords: Array<Record<string, unknown>>;
    stories: Array<Record<string, unknown>>;
  };
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  await db.transaction(
    "rw",
    [db.words, db.variants, db.sentences, db.lists, db.listWords, db.stories],
    async () => {
      for (const w of data.words) {
        const local = await db.words.get(w.id as string);
        if (local && local.updatedAt >= (iso(w.updatedAt) ?? "")) continue;
        await db.words.put({
          id: w.id as string,
          language: w.language as "es",
          lemma: w.lemma as string,
          translation: w.translation as string,
          pos: (w.pos as never) ?? "other",
          dictionaryRef: (w.dictionaryRef as string | null) ?? undefined,
          createdAt: iso(w.createdAt) ?? new Date().toISOString(),
          updatedAt: iso(w.updatedAt) ?? new Date().toISOString(),
          deletedAt: iso(w.deletedAt),
        });
      }
      for (const v of data.variants) {
        if (await db.variants.get(v.id as string)) continue;
        await db.variants.put({
          id: v.id as string,
          wordId: v.wordId as string,
          kind: v.kind as never,
          front: v.front as string,
          back: v.back as string,
          createdAt: iso(v.createdAt) ?? new Date().toISOString(),
        });
      }
      for (const s of data.sentences) {
        if (await db.sentences.get(s.id as string)) continue;
        await db.sentences.put({
          id: s.id as string,
          wordId: s.wordId as string,
          position: s.position as number,
          text: s.text as string,
          translation: s.translation as string,
          source: s.source as never,
          storyId: (s.storyId as string | null) ?? undefined,
        });
      }
      for (const l of data.lists) {
        const local = await db.lists.get(l.id as string);
        if (local && local.updatedAt >= (iso(l.updatedAt) ?? "")) continue;
        await db.lists.put({
          id: l.id as string,
          language: l.language as "es",
          title: l.title as string,
          description: (l.description as string | null) ?? undefined,
          colour: l.colour as never,
          isSystem: l.isSystem as boolean,
          createdAt: iso(l.createdAt) ?? new Date().toISOString(),
          updatedAt: iso(l.updatedAt) ?? new Date().toISOString(),
          deletedAt: iso(l.deletedAt),
        });
      }
      for (const lw of data.listWords) {
        if (lw.deletedAt) {
          await db.listWords.delete([lw.listId as string, lw.wordId as string]);
          continue;
        }
        await db.listWords.put({
          listId: lw.listId as string,
          wordId: lw.wordId as string,
          position: lw.position as number,
          addedAt: iso(lw.addedAt) ?? new Date().toISOString(),
        });
      }
      for (const s of data.stories) {
        const doc = s.documentJson as Record<string, unknown> | undefined;
        if (!doc?.paragraphs || s.status !== "ready") continue;
        await db.stories.put({
          ...(doc as unknown as StoryDocument),
          archived: s.archived as boolean,
        });
      }
    },
  );
  set(CURSOR_KEY, data.cursor);
}

/** Second device / reinstall: fetch events the device has never seen and rebuild derived state. */
async function pullEvents() {
  const since = get(EVENT_CURSOR_KEY) ?? "";
  const data = (await api(`/sync/pull/events?since=${encodeURIComponent(since)}`)) as {
    cursor: string;
    events: Array<Record<string, unknown>>;
    more: boolean;
  };
  if (data.events.length) {
    const touched = new Set<string>();
    await db.transaction("rw", [db.events, db.cardStates], async () => {
      for (const e of data.events) {
        if (await db.events.get(e.id as string)) continue;
        const ev: ReviewEvent = {
          id: e.id as string,
          variantId: e.variantId as string,
          wordId: e.wordId as string,
          grade: e.grade as 1 | 2 | 3 | 4,
          reactionMs: (e.reactionMs as number | null) ?? null,
          mode: e.mode as never,
          promptKind: (e.promptKind as never) ?? null,
          reviewedAt: new Date(e.reviewedAt as string).toISOString(),
          supersedes: (e.supersedes as string | null) ?? null,
          manual: Boolean(e.manual),
          synced: true,
        };
        await db.events.put(ev);
        touched.add(ev.variantId);
      }
      for (const variantId of touched) {
        const all = await db.events.where("variantId").equals(variantId).toArray();
        const state = replay(all).get(variantId);
        if (state) await db.cardStates.put(state);
      }
    });
  }
  set(EVENT_CURSOR_KEY, data.cursor);
  if (data.more) await pullEvents();
}

export async function syncNow(): Promise<void> {
  if (!isCloudEnabled) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!(await getAccessToken())) return;
    emit({ ...status, state: "syncing" });
    try {
      await push();
      await pull();
      await pullEvents();
      const at = new Date().toISOString();
      set(LAST_KEY, at);
      emit({ state: "idle", lastAt: at });
    } catch (e) {
      emit({ ...status, state: "error", error: String(e) });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Triggers: online, app foreground, every 5 minutes while visible, plus explicit syncNow() after a session. */
export function startSyncScheduler(): () => void {
  if (!isCloudEnabled || typeof window === "undefined") return () => undefined;
  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  const interval = setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) void syncNow();
  }, 5 * 60_000);
  void syncNow();
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(interval);
  };
}
