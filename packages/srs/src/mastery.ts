import type { CardState, ReviewEvent } from "@lm/schema";
import { toLocalDay } from "./dates";
import { applyReview, isMastered, type SchedulerOptions } from "./fsrs";
import { liveEvents } from "./replay";

/**
 * Walk the event log and record the local day each word first became mastered
 * (any one variant crossing the mastery threshold counts).
 */
export function masteryTimeline(
  events: readonly ReviewEvent[],
  opts?: SchedulerOptions,
): Map<string, string> {
  const states = new Map<string, CardState>();
  const mastered = new Map<string, string>();
  const live = liveEvents(events)
    .slice()
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  for (const e of live) {
    const at = new Date(e.reviewedAt);
    const next = applyReview(
      states.get(e.variantId) ?? null,
      e.variantId,
      e.wordId,
      e.grade,
      at,
      opts,
    );
    states.set(e.variantId, next);
    if (isMastered(next) && !mastered.has(e.wordId)) mastered.set(e.wordId, toLocalDay(at));
  }
  return mastered;
}
