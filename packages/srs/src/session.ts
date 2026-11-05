import type { Grade, PartOfSpeech, SessionMode } from "@lm/schema";

export interface SessionCard {
  variantId: string;
  wordId: string;
  front: string;
  back: string;
  pos: PartOfSpeech;
  isNew: boolean;
  /** Prompt direction for this card: target→native or native→target. */
  dir?: "t2n" | "n2t";
}

export type ProgressivePhase = "choice" | "typing";
export type StepDir = "t2n" | "n2t";

/** One rung of the progressive ladder: how a card is asked and in which direction. */
export interface SessionStep {
  kind: ProgressivePhase;
  dir: StepDir;
}

/**
 * Ladder for the progressive / learn-forever modes. The first encounter is always multiple
 * choice from the native language, the first typed answer always target→native; with "both"
 * the remaining combinations follow so every card is answered in every form before it clears.
 */
export function progressiveLadder(direction: StepDir | "both"): SessionStep[] {
  if (direction === "both")
    return [
      { kind: "choice", dir: "n2t" },
      { kind: "typing", dir: "t2n" },
      { kind: "choice", dir: "t2n" },
      { kind: "typing", dir: "n2t" },
    ];
  return [
    { kind: "choice", dir: direction },
    { kind: "typing", dir: direction },
  ];
}

export interface SessionConfig {
  mode: SessionMode;
  /** Max struggling cards held in the retry buffer at once (cognitive load cap). */
  maxRetryBuffer: number;
  /** Again grades in one session after which a card is skipped for today. */
  maxAgainPerCard: number;
  retryAgainMs: number;
  retryHardMs: number;
  /** Progressive ladder; when set, every card must pass each step with Gut or better. */
  ladder?: SessionStep[];
  /** Cards that passed a step come back after this many other cards. */
  stepGapCards: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  mode: "classic",
  maxRetryBuffer: 10,
  maxAgainPerCard: 3,
  retryAgainMs: 5 * 60_000,
  retryHardMs: 10 * 60_000,
  stepGapCards: 3,
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
  /** Ladder step index per card (only with config.ladder). */
  step: Record<string, number>;
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
  const cfg: SessionConfig = { ...DEFAULT_SESSION_CONFIG, ...config };
  if (!cfg.ladder && (cfg.mode === "progressive" || cfg.mode === "forever"))
    cfg.ladder = progressiveLadder("t2n");
  const map: Record<string, SessionCard> = {};
  const phase: Record<string, ProgressivePhase> = {};
  const step: Record<string, number> = {};
  for (const c of cards) {
    map[c.variantId] = c;
    if (cfg.ladder) {
      phase[c.variantId] = cfg.ladder[0]?.kind ?? "choice";
      step[c.variantId] = 0;
    }
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
    step,
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
  } else if (next.config.ladder && (state.step[id] ?? 0) + 1 < next.config.ladder.length) {
    // Passed this step: come back for the next one after a few other cards.
    const s = (state.step[id] ?? 0) + 1;
    const insertAt = Math.min(next.queue.length, next.config.stepGapCards);
    const queue = next.queue.slice();
    queue.splice(insertAt, 0, id);
    next = {
      ...next,
      queue,
      step: { ...next.step, [id]: s },
      phase: { ...next.phase, [id]: next.config.ladder[s]?.kind ?? "typing" },
    };
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

/** The ladder step the current (or given) card is on, or null outside ladder modes. */
export function currentStep(state: SessionState, id = state.current): SessionStep | null {
  if (!id || !state.config.ladder) return null;
  return state.config.ladder[state.step[id] ?? 0] ?? null;
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
