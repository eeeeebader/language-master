import {
  cardVariants,
  type DbLike,
  lists,
  listWords,
  reviewEvents,
  stories,
  userSettings,
  userWords,
  wordSentences,
} from "@lm/database";
import type { ReviewEvent } from "@lm/schema";
import { replay } from "@lm/srs";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import {
  type LwwRow,
  lwwWins,
  nextCursor,
  type PushBody,
  parseCursor,
  partitionEvents,
} from "./logic";

type EventIn = Omit<ReviewEvent, "synced">;

export async function pushEvents(db: DbLike, userId: string, events: EventIn[]) {
  if (events.length === 0)
    return {
      accepted: [] as string[],
      duplicates: [] as string[],
      affectedWordIds: [] as string[],
    };
  const ids = events.map((e) => e.id);
  const known = new Set(
    (
      await db
        .select({ id: reviewEvents.id })
        .from(reviewEvents)
        .where(and(eq(reviewEvents.userId, userId), inArray(reviewEvents.id, ids)))
    ).map((r) => r.id),
  );
  const { fresh, duplicates, affectedWordIds } = partitionEvents(events, known);
  if (fresh.length) {
    await db
      .insert(reviewEvents)
      .values(
        fresh.map((e) => ({
          id: e.id,
          userId,
          variantId: e.variantId,
          wordId: e.wordId,
          grade: e.grade,
          reactionMs: e.reactionMs,
          mode: e.mode,
          promptKind: e.promptKind,
          reviewedAt: new Date(e.reviewedAt),
          supersedes: e.supersedes,
          manual: e.manual,
        })),
      )
      .onConflictDoNothing();
  }
  return { accepted: fresh.map((e) => e.id), duplicates, affectedWordIds };
}

/** Derive user_words.srs_* for the given words by replaying their full event log. */
export async function recomputeWords(db: DbLike, userId: string, wordIds: string[]) {
  if (wordIds.length === 0) return;
  const rows = await db
    .select()
    .from(reviewEvents)
    .where(and(eq(reviewEvents.userId, userId), inArray(reviewEvents.wordId, wordIds)));
  const events: ReviewEvent[] = rows.map((r) => ({
    id: r.id,
    variantId: r.variantId,
    wordId: r.wordId,
    grade: r.grade as 1 | 2 | 3 | 4,
    reactionMs: r.reactionMs,
    mode: r.mode as ReviewEvent["mode"],
    promptKind: r.promptKind as ReviewEvent["promptKind"],
    reviewedAt: r.reviewedAt.toISOString(),
    supersedes: r.supersedes,
    manual: r.manual,
    synced: true,
  }));
  const states = replay(events);
  // One word may have several variants: the word-level cache takes the variant with the highest stability.
  const byWord = new Map<
    string,
    { stability: number; difficulty: number; due: Date; reps: number; lapses: number }
  >();
  for (const s of states.values()) {
    const cur = byWord.get(s.wordId);
    if (!cur || s.stability > cur.stability)
      byWord.set(s.wordId, {
        stability: s.stability,
        difficulty: s.difficulty,
        due: new Date(s.due),
        reps: s.reps,
        lapses: s.lapses,
      });
  }
  for (const [wordId, s] of byWord) {
    await db
      .update(userWords)
      .set({
        srsStability: s.stability,
        srsDifficulty: s.difficulty,
        srsDueAt: s.due,
        srsReps: s.reps,
        srsLapses: s.lapses,
      })
      .where(and(eq(userWords.id, wordId), eq(userWords.userId, userId)));
  }
}

function pick<T extends Record<string, unknown>>(
  row: LwwRow,
  keys: (keyof T & string)[],
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in row) out[k] = row[k];
  return out as Partial<T>;
}

/** Upsert LWW rows; the incoming row wins only if its updatedAt is newer. */
export async function pushLww(db: DbLike, userId: string, body: PushBody) {
  const ts = (s: string | null | undefined) => (s ? new Date(s) : null);

  for (const w of body.words) {
    const existing = await db
      .select({ updatedAt: userWords.updatedAt })
      .from(userWords)
      .where(and(eq(userWords.id, w.id), eq(userWords.userId, userId)))
      .limit(1);
    if (!lwwWins(w.updatedAt, existing[0]?.updatedAt.toISOString())) continue;
    const p = pick<{
      language: string;
      lemma: string;
      translation: string;
      pos: string;
      dictionaryRef: string | null;
    }>(w, ["language", "lemma", "translation", "pos", "dictionaryRef"]);
    await db
      .insert(userWords)
      .values({
        id: w.id,
        userId,
        language: p.language ?? "es",
        lemma: p.lemma ?? "",
        translation: p.translation ?? "",
        pos: p.pos ?? "other",
        dictionaryRef: p.dictionaryRef ?? null,
        updatedAt: new Date(w.updatedAt),
        deletedAt: ts(w.deletedAt),
      })
      .onConflictDoUpdate({
        target: userWords.id,
        set: {
          translation: p.translation ?? "",
          pos: p.pos ?? "other",
          dictionaryRef: p.dictionaryRef ?? null,
          updatedAt: new Date(w.updatedAt),
          deletedAt: ts(w.deletedAt),
        },
      });
  }

  for (const v of body.variants) {
    const p = pick<{ wordId: string; kind: string; front: string; back: string }>(v, [
      "wordId",
      "kind",
      "front",
      "back",
    ]);
    if (!p.wordId) continue;
    await db
      .insert(cardVariants)
      .values({
        id: v.id,
        userId,
        wordId: p.wordId,
        kind: p.kind ?? "lemma",
        front: p.front ?? "",
        back: p.back ?? "",
        updatedAt: new Date(v.updatedAt),
        deletedAt: ts(v.deletedAt),
      })
      .onConflictDoUpdate({
        target: cardVariants.id,
        set: {
          front: p.front ?? "",
          back: p.back ?? "",
          updatedAt: new Date(v.updatedAt),
          deletedAt: ts(v.deletedAt),
        },
      });
  }

  for (const s of body.sentences) {
    const p = pick<{
      wordId: string;
      position: number;
      text: string;
      translation: string;
      source: string;
      storyId: string | null;
    }>(s, ["wordId", "position", "text", "translation", "source", "storyId"]);
    if (!p.wordId) continue;
    await db
      .insert(wordSentences)
      .values({
        id: s.id,
        userId,
        wordId: p.wordId,
        position: p.position ?? 1,
        text: p.text ?? "",
        translation: p.translation ?? "",
        source: p.source ?? "own",
        storyId: p.storyId ?? null,
        updatedAt: new Date(s.updatedAt),
        deletedAt: ts(s.deletedAt),
      })
      .onConflictDoUpdate({
        target: wordSentences.id,
        set: {
          position: p.position ?? 1,
          text: p.text ?? "",
          translation: p.translation ?? "",
          updatedAt: new Date(s.updatedAt),
          deletedAt: ts(s.deletedAt),
        },
      });
  }

  for (const l of body.lists) {
    const existing = await db
      .select({ updatedAt: lists.updatedAt })
      .from(lists)
      .where(and(eq(lists.id, l.id), eq(lists.userId, userId)))
      .limit(1);
    if (!lwwWins(l.updatedAt, existing[0]?.updatedAt.toISOString())) continue;
    const p = pick<{
      language: string;
      title: string;
      description: string | null;
      colour: string;
      isSystem: boolean;
    }>(l, ["language", "title", "description", "colour", "isSystem"]);
    await db
      .insert(lists)
      .values({
        id: l.id,
        userId,
        language: p.language ?? "es",
        title: p.title ?? "",
        description: p.description ?? null,
        colour: p.colour ?? "sage",
        isSystem: p.isSystem ?? false,
        updatedAt: new Date(l.updatedAt),
        deletedAt: ts(l.deletedAt),
      })
      .onConflictDoUpdate({
        target: lists.id,
        set: {
          title: p.title ?? "",
          description: p.description ?? null,
          colour: p.colour ?? "sage",
          updatedAt: new Date(l.updatedAt),
          deletedAt: ts(l.deletedAt),
        },
      });
  }

  for (const lw of body.listWords) {
    await db
      .insert(listWords)
      .values({
        userId,
        listId: lw.listId,
        wordId: lw.wordId,
        position: lw.position,
        addedAt: new Date(lw.addedAt),
        updatedAt: new Date(),
        deletedAt: ts(lw.deletedAt),
      })
      .onConflictDoUpdate({
        target: [listWords.listId, listWords.wordId],
        set: { position: lw.position, updatedAt: new Date(), deletedAt: ts(lw.deletedAt) },
      });
  }

  for (const s of body.stories) {
    const existing = await db
      .select({ updatedAt: stories.updatedAt })
      .from(stories)
      .where(and(eq(stories.id, s.id), eq(stories.userId, userId)))
      .limit(1);
    if (!lwwWins(s.updatedAt, existing[0]?.updatedAt.toISOString())) continue;
    // Clients only change archive state and metadata of their own stories; documents are server-authored.
    const p = pick<{ archived: boolean }>(s, ["archived"]);
    await db
      .update(stories)
      .set({
        archived: p.archived ?? false,
        updatedAt: new Date(s.updatedAt),
        deletedAt: ts(s.deletedAt),
      })
      .where(and(eq(stories.id, s.id), eq(stories.userId, userId)));
  }

  if (body.settings) {
    const s = body.settings;
    const existing = await db
      .select({ updatedAt: userSettings.updatedAt })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    if (lwwWins(s.updatedAt, existing[0]?.updatedAt.toISOString())) {
      const p = pick<{
        soundOn: boolean;
        hapticsOn: boolean;
        dailyNewCards: number;
        learningDays: number[];
        vacationUntil: string | null;
        timezone: string;
        notificationsJson: unknown;
      }>(s, [
        "soundOn",
        "hapticsOn",
        "dailyNewCards",
        "learningDays",
        "vacationUntil",
        "timezone",
        "notificationsJson",
      ]);
      await db
        .insert(userSettings)
        .values({
          userId,
          soundOn: p.soundOn ?? true,
          hapticsOn: p.hapticsOn ?? true,
          dailyNewCards: p.dailyNewCards ?? 10,
          learningDays: p.learningDays ?? [1, 2, 3, 4, 5],
          vacationUntil: p.vacationUntil ?? null,
          timezone: p.timezone ?? "Europe/Berlin",
          notificationsJson: p.notificationsJson ?? {},
          updatedAt: new Date(s.updatedAt),
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: {
            soundOn: p.soundOn ?? true,
            hapticsOn: p.hapticsOn ?? true,
            dailyNewCards: p.dailyNewCards ?? 10,
            learningDays: p.learningDays ?? [1, 2, 3, 4, 5],
            vacationUntil: p.vacationUntil ?? null,
            timezone: p.timezone ?? "Europe/Berlin",
            notificationsJson: p.notificationsJson ?? {},
            updatedAt: new Date(s.updatedAt),
          },
        });
    }
  }
}

export async function pull(db: DbLike, userId: string, sinceRaw: string | undefined) {
  const since = parseCursor(sinceRaw);
  const [w, v, se, l, lw, st, settings] = await Promise.all([
    db
      .select()
      .from(userWords)
      .where(and(eq(userWords.userId, userId), gt(userWords.updatedAt, since))),
    db
      .select()
      .from(cardVariants)
      .where(and(eq(cardVariants.userId, userId), gt(cardVariants.updatedAt, since))),
    db
      .select()
      .from(wordSentences)
      .where(and(eq(wordSentences.userId, userId), gt(wordSentences.updatedAt, since))),
    db
      .select()
      .from(lists)
      .where(and(eq(lists.userId, userId), gt(lists.updatedAt, since))),
    db
      .select()
      .from(listWords)
      .where(and(eq(listWords.userId, userId), gt(listWords.updatedAt, since))),
    db
      .select()
      .from(stories)
      .where(and(eq(stories.userId, userId), gt(stories.updatedAt, since))),
    db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.userId, userId), gt(userSettings.updatedAt, since)))
      .limit(1),
  ]);
  const all = [...w, ...v, ...se, ...l, ...lw, ...st, ...settings];
  return {
    cursor: nextCursor(all, since),
    words: w,
    variants: v,
    sentences: se,
    lists: l,
    listWords: lw,
    stories: st,
    settings: settings[0] ?? null,
  };
}

/** Events the device has not seen (by received_at), for a fresh install or a second device. */
export async function pullEvents(db: DbLike, userId: string, sinceRaw: string | undefined) {
  const since = parseCursor(sinceRaw);
  const rows = await db
    .select()
    .from(reviewEvents)
    .where(and(eq(reviewEvents.userId, userId), gt(reviewEvents.receivedAt, since)))
    .orderBy(reviewEvents.receivedAt)
    .limit(5000);
  const cursor = rows.length
    ? (rows[rows.length - 1] as (typeof rows)[number]).receivedAt.toISOString()
    : since.toISOString();
  return { cursor, events: rows, more: rows.length === 5000 };
}

export async function touchLastLogin(db: DbLike, userId: string) {
  await db.execute(sql`update users set last_login_at = now() where id = ${userId}`);
}
