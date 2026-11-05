import type { Grade, PartOfSpeech, SessionMode } from "@lm/schema";

export interface SessionCard {
  variantId: string;
  wordId: string;
  front: string;
  back: string;
  pos: PartOfSpeech;
  isNew: boolean;
}

export type ProgressivePhase = "choice" | "typing";

export interface SessionConfig {
  mode: SessionMode;
  /** Max struggling cards held in the retry buffer at once (cognitive load cap). */
  maxRetryBuffer: number;
  /** Again grades in one session after which a card is skipped for today. */
  maxAgainPerCard: number;
  retryAgainMs: number;
  retryHardMs: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  mode: "classic",
  maxRetryBuffer: 10,
  maxAgainPerCard: 3,
  retryAgainMs: 5 * 60_000,
  retryHardMs: 10 * 60_000,
};

export interface RetryItem {
  variantId: string;
  dueAt: number;
}

export interface AnswerRecord {
  variantId: string;
  grade: Grade;
  at: number;
  phase: ProgressivePhase | null;
}

export interface SessionState {
  config: SessionConfig;
  cards: Record<string, SessionCard>;
  /** Main queue in presentation order (variant ids). */
  queue: string[];
  retry: RetryItem[];
  cleared: string[];
  skipped: string[];
  againCount: Record<string, number>;
  phase: Record<string, ProgressivePhase>;
  current: string | null;
  answers: AnswerRecord[];
  /** Snapshot before the last answer, for one-tap override. */
  prev: SessionState | null;
  startedAt: number;
}

export function createSession(
  cards: readonly SessionCard[],
  config: Partial<SessionConfig> & { mode: SessionMode },
  now: number,
): SessionState {
  const cfg = { ...DEFAULT_SESSION_CONFIG, ...config };
  const map: Record<string, SessionCard> = {};
  const phase: Record<string, ProgressivePhase> = {};
  for (const c of cards) {
    map[c.variantId] = c;
    if (cfg.mode === "progressive") phase[c.variantId] = "choice";
  }
  const state: SessionState = {
    config: cfg,
    cards: map,
    queue: cards.map((c) => c.variantId),
    retry: [],
    cleared: [],
    skipped: [],
    againCount: {},
    phase,
    current: null,
    answers: [],
    prev: null,
    startedAt: now,
  };
  return advance(state, now);
}

/** Pick the next card: a due retry first, then the main queue, then the earliest retry even if early. */
export function advance(state: SessionState, now: number): SessionState {
  const dueRetry = state.retry.filter((r) => r.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt)[0];
  if (dueRetry) {
    return {
      ...state,
      current: dueRetry.variantId,
      retry: state.retry.filter((r) => r.variantId !== dueRetry.variantId),
    };
  }
  const [head, ...rest] = state.queue;
  if (head !== undefined) return { ...state, current: head, queue: rest };
  const earliest = state.retry.slice().sort((a, b) => a.dueAt - b.dueAt)[0];
  if (earliest) {
    return {
      ...state,
      current: earliest.variantId,
      retry: state.retry.filter((r) => r.variantId !== earliest.variantId),
    };
  }
  return { ...state, current: null };
}

export function isFinished(state: SessionState): boolean {
  return state.current === null && state.queue.length === 0 && state.retry.length === 0;
}

export function remaining(state: SessionState): number {
  return state.queue.length + state.retry.length + (state.current ? 1 : 0);
}

/** Apply a grade for the current card and advance. Stores a snapshot for override. */
export function answer(state: SessionState, grade: Grade, now: number): SessionState {
  const id = state.current;
  if (!id) return state;
  const snapshot: SessionState = { ...state, prev: null };
  const phase = state.phase[id] ?? null;
  let next: SessionState = {
    ...state,
    answers: [...state.answers, { variantId: id, grade, at: now, phase }],
    prev: snapshot,
  };

  if (grade === 4) {
    const count = (state.againCount[id] ?? 0) + 1;
    next = { ...next, againCount: { ...state.againCount, [id]: count } };
    const bufferFull = next.retry.length >= next.config.maxRetryBuffer;
    if (count >= next.config.maxAgainPerCard || bufferFull) {
      next = { ...next, skipped: [...next.skipped, id] };
    } else {
      next = {
        ...next,
        retry: [...next.retry, { variantId: id, dueAt: now + next.config.retryAgainMs }],
      };
    }
  } else if (grade === 3) {
    if (next.retry.length >= next.config.maxRetryBuffer) {
      next = { ...next, skipped: [...next.skipped, id] };
    } else {
      next = {
        ...next,
        retry: [...next.retry, { variantId: id, dueAt: now + next.config.retryHardMs }],
      };
    }
  } else if (next.config.mode === "progressive" && phase === "choice") {
    // Passed multiple choice: come back for typing after a few other cards.
    const insertAt = Math.min(next.queue.length, 3);
    const queue = next.queue.slice();
    queue.splice(insertAt, 0, id);
    next = { ...next, queue, phase: { ...next.phase, [id]: "typing" } };
  } else {
    next = { ...next, cleared: [...next.cleared, id] };
  }

  return advance({ ...next, current: null }, now);
}

/** Skip the current card for the rest of the session (stays due in the scheduler). */
export function skip(state: SessionState, now: number): SessionState {
  const id = state.current;
  if (!id) return state;
  return advance(
    { ...state, current: null, skipped: [...state.skipped, id], prev: { ...state, prev: null } },
    now,
  );
}

/** One-tap override: roll back the last answer and regrade it. */
export function regradeLast(state: SessionState, grade: Grade, now: number): SessionState {
  if (!state.prev) return state;
  const last = state.answers[state.answers.length - 1];
  if (!last) return state;
  const rolled = { ...state.prev, current: last.variantId };
  return answer(rolled, grade, now);
}

export function lastAnswer(state: SessionState): AnswerRecord | undefined {
  return state.answers[state.answers.length - 1];
}

export interface SessionSummary {
  total: number;
  cleared: number;
  skipped: string[];
  answers: number;
  byGrade: Record<Grade, number>;
  durationMs: number;
}

export function summarise(state: SessionState, now: number): SessionSummary {
  const byGrade: Record<Grade, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const a of state.answers) byGrade[a.grade]++;
  return {
    total: Object.keys(state.cards).length,
    cleared: state.cleared.length,
    skipped: state.skipped,
    answers: state.answers.length,
    byGrade,
    durationMs: now - state.startedAt,
  };
}
