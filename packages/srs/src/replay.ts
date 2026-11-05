import type { CardState, ReviewEvent } from "@lm/schema";
import { applyReview, type SchedulerOptions } from "./fsrs";

/**
 * Derive card state from an immutable event log.
 * Superseded events (overrides) are skipped; replay is deterministic, so the
 * device and the server reach the same state from the same log.
 */
export function replay(
  events: readonly ReviewEvent[],
  opts?: SchedulerOptions,
): Map<string, CardState> {
  const superseded = new Set<string>();
  for (const e of events) if (e.supersedes) superseded.add(e.supersedes);

  const live = events
    .filter((e) => !superseded.has(e.id))
    .slice()
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id.localeCompare(b.id));

  const states = new Map<string, CardState>();
  for (const e of live) {
    const prev = states.get(e.variantId) ?? null;
    states.set(
      e.variantId,
      applyReview(prev, e.variantId, e.wordId, e.grade, new Date(e.reviewedAt), opts),
    );
  }
  return states;
}

/** Replay only the events of one variant (fast path for a single override). */
export function replayVariant(
  events: readonly ReviewEvent[],
  variantId: string,
  opts?: SchedulerOptions,
): CardState | null {
  return (
    replay(
      events.filter((e) => e.variantId === variantId),
      opts,
    ).get(variantId) ?? null
  );
}

/** Live (non-superseded) events only. */
export function liveEvents(events: readonly ReviewEvent[]): ReviewEvent[] {
  const superseded = new Set(events.filter((e) => e.supersedes).map((e) => e.supersedes as string));
  return events.filter((e) => !superseded.has(e.id));
}
