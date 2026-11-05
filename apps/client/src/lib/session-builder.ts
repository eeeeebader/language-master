import type { CardState, CardVariant, ReviewEvent, UserWord } from "@lm/schema";
import { isDue, type SessionCard, shuffle } from "@lm/srs";
import { db } from "@/db/db";
import { rateWord } from "@/lib/rating";

export type Direction = "t2n" | "n2t" | "both";
export type Filter = "all" | "due" | "failed" | "new";
export type Focus = "new" | "easy" | "ok" | "hard" | "failed";

export interface BuildOptions {
  language: "es";
  listIds: string[];
  filter: Filter;
  direction: Direction;
  sample: number | null;
  /** Learn Forever: due first, then new up to this many */
  forever?: { newLimit: number };
  /** Focus badges from the practice setup; empty = all words. */
  focus?: Focus[];
}

function toCard(
  v: CardVariant,
  w: UserWord,
  state: CardState | undefined,
  direction: Direction,
): SessionCard {
  const dir = direction === "both" ? (Math.random() < 0.5 ? "t2n" : "n2t") : direction;
  return {
    variantId: v.id,
    wordId: w.id,
    front: dir === "t2n" ? v.front : v.back,
    back: dir === "t2n" ? v.back : v.front,
    pos: w.pos,
    isNew: !state,
    dir,
  };
}

export async function buildSession(opts: BuildOptions): Promise<SessionCard[]> {
  const now = new Date();
  let wordIds: Set<string>;
  if (opts.forever) {
    const words = await db.words.where("language").equals(opts.language).toArray();
    wordIds = new Set(words.filter((w) => !w.deletedAt).map((w) => w.id));
  } else {
    const lw = await db.listWords.where("listId").anyOf(opts.listIds).toArray();
    wordIds = new Set(lw.map((x) => x.wordId));
  }
  const words = (await db.words.bulkGet([...wordIds])).filter(
    (w): w is UserWord => !!w && !w.deletedAt,
  );
  const wordMap = new Map(words.map((w) => [w.id, w]));
  const variants = await db.variants
    .where("wordId")
    .anyOf([...wordMap.keys()])
    .toArray();
  const states = new Map(
    (await db.cardStates.bulkGet(variants.map((v) => v.id)))
      .filter((s): s is CardState => !!s)
      .map((s) => [s.variantId, s]),
  );

  const focus = new Set(opts.focus ?? []);
  let failedVariantIds: Set<string> | null = null;
  if (opts.filter === "failed" || focus.has("failed")) {
    const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const recent = await db.events.where("reviewedAt").above(since).toArray();
    const superseded = new Set(
      recent.filter((e) => e.supersedes).map((e) => e.supersedes as string),
    );
    failedVariantIds = new Set(
      recent
        .filter((e: ReviewEvent) => !superseded.has(e.id) && e.grade === 4)
        .map((e) => e.variantId),
    );
  }

  let cards: SessionCard[] = [];
  for (const v of variants) {
    const w = wordMap.get(v.wordId);
    if (!w) continue;
    const st = states.get(v.id);
    if (opts.filter === "due" && !isDue(st, now)) continue;
    if (opts.filter === "new" && st) continue;
    if (opts.filter === "failed" && failedVariantIds && !failedVariantIds.has(v.id)) continue;
    if (focus.size > 0) {
      const wordStates = variants
        .filter((x) => x.wordId === w.id)
        .map((x) => states.get(x.id))
        .filter((x): x is CardState => !!x);
      const { rating } = rateWord(wordStates, now);
      const matches =
        (focus.has("new") && rating === "new") ||
        (focus.has("easy") && rating === "strong") ||
        (focus.has("ok") && rating === "ok") ||
        (focus.has("hard") && rating === "weak") ||
        (focus.has("failed") && !!failedVariantIds?.has(v.id));
      if (!matches) continue;
    }
    cards.push(toCard(v, w, st, opts.direction));
  }

  if (opts.forever) {
    const due = shuffle(cards.filter((c) => !c.isNew && isDue(states.get(c.variantId), now)));
    const fresh = shuffle(cards.filter((c) => c.isNew)).slice(0, opts.forever.newLimit);
    return [...due, ...fresh];
  }

  cards = shuffle(cards);
  if (opts.sample && opts.sample > 0) cards = cards.slice(0, opts.sample);
  return cards;
}

/** New cards already introduced today, to honour the daily new-card rate. */
export async function newCardsSeenToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const todays = await db.events.where("reviewedAt").above(start.toISOString()).toArray();
  const firstSeen = new Set<string>();
  for (const e of todays) {
    const earlier = await db.events
      .where("variantId")
      .equals(e.variantId)
      .and((x) => x.reviewedAt < start.toISOString())
      .count();
    if (earlier === 0) firstSeen.add(e.variantId);
  }
  return firstSeen.size;
}
