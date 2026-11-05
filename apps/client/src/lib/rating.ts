import type { CardState } from "@lm/schema";
import { isMastered, retrievability } from "@lm/srs";

export type Rating = "new" | "weak" | "ok" | "strong";

/** Coarse practice level for a word from its best variant state. */
export function rateWord(
  states: CardState[],
  now = new Date(),
): { rating: Rating; retention: number | null } {
  if (states.length === 0) return { rating: "new", retention: null };
  const best = states.reduce((a, b) => (a.stability >= b.stability ? a : b));
  const r = Math.max(...states.map((s) => retrievability(s, now)));
  if (states.some(isMastered)) return { rating: "strong", retention: r };
  if (best.lapses >= 2 || best.state === 3 || best.stability < 2 || r < 0.7)
    return { rating: "weak", retention: r };
  return { rating: "ok", retention: r };
}

export const RATING_TONE: Record<Rating, "sage" | "rose" | "lavender" | "amber" | "sky"> = {
  new: "sky",
  weak: "rose",
  ok: "amber",
  strong: "sage",
};
