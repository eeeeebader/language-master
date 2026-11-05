import type { CardState, Grade } from "@lm/schema";
import { type Card, createEmptyCard, type FSRSParameters, fsrs, Rating } from "ts-fsrs";

/**
 * Our grades: 1 Easy · 2 Good · 3 Hard · 4 Again (reaction-time scale, 1 = instant).
 * FSRS ratings:  Easy 4 · Good 3 · Hard 2 · Again 1. The mapping is 5 - grade.
 */
export function toFsrsRating(grade: Grade): 1 | 2 | 3 | 4 {
  return (5 - grade) as 1 | 2 | 3 | 4;
}

export const GRADE_LABEL: Record<Grade, "Easy" | "Good" | "Hard" | "Again"> = {
  1: "Easy",
  2: "Good",
  3: "Hard",
  4: "Again",
};

export type SchedulerOptions = Partial<
  Pick<FSRSParameters, "w" | "request_retention" | "maximum_interval">
>;

/** Stability (days) above which a card counts as mastered on the dashboard. */
export const MASTERY_STABILITY_DAYS = 21;

function makeScheduler(opts?: SchedulerOptions) {
  return fsrs({
    request_retention: 0.9,
    maximum_interval: 365,
    enable_fuzz: false,
    enable_short_term: true,
    ...opts,
  });
}

export function emptyState(variantId: string, wordId: string, now: Date): CardState {
  return cardToState(variantId, wordId, createEmptyCard(now));
}

export function cardToState(variantId: string, wordId: string, card: Card): CardState {
  return {
    variantId,
    wordId,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    lastReview: card.last_review ? card.last_review.toISOString() : null,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as 0 | 1 | 2 | 3,
    elapsedDays: 0,
    scheduledDays: card.scheduled_days,
  };
}

export function stateToCard(s: CardState): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    scheduled_days: s.scheduledDays,
    learning_steps: 0,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as 0 | 1 | 2 | 3,
    last_review: s.lastReview ? new Date(s.lastReview) : undefined,
  };
}

/** Pure: apply one graded review to a card state at time `at`. */
export function applyReview(
  prev: CardState | null,
  variantId: string,
  wordId: string,
  grade: Grade,
  at: Date,
  opts?: SchedulerOptions,
): CardState {
  const f = makeScheduler(opts);
  const card = prev ? stateToCard(prev) : createEmptyCard(at);
  const { card: next } = f.next(card, at, toFsrsRating(grade));
  return cardToState(variantId, wordId, next);
}

/** Preview the four possible next due dates for a card, keyed by our grade. */
export function previewReview(
  prev: CardState | null,
  at: Date,
  opts?: SchedulerOptions,
): Record<Grade, Date> {
  const f = makeScheduler(opts);
  const card = prev ? stateToCard(prev) : createEmptyCard(at);
  const log = f.repeat(card, at);
  return {
    1: log[Rating.Easy].card.due,
    2: log[Rating.Good].card.due,
    3: log[Rating.Hard].card.due,
    4: log[Rating.Again].card.due,
  };
}

export function isDue(state: CardState | undefined, now: Date): boolean {
  if (!state) return true;
  return new Date(state.due).getTime() <= now.getTime();
}

export function isMastered(state: CardState | undefined): boolean {
  return !!state && state.state === 2 && state.stability >= MASTERY_STABILITY_DAYS;
}

/** Retention estimate for a card at `now`, using the FSRS-6 forgetting curve. */
export function retrievability(state: CardState, now: Date): number {
  if (!state.lastReview || state.stability <= 0) return 0;
  const elapsed = Math.max(0, (now.getTime() - new Date(state.lastReview).getTime()) / 86_400_000);
  const decay = -0.2;
  const factor = 0.9 ** (1 / decay) - 1;
  return (1 + factor * (elapsed / state.stability)) ** decay;
}
