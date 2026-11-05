import type { Grade, PromptKind, ResponseProfile } from "@lm/schema";

export const DEFAULT_BASE_MS = 1500;
export const PER_CHAR_MS = 90;
export const EMA_ALPHA = 0.3;
export const PROFILE_MIN_N = 3;

/** Reaction-time threshold normalised against word length. */
export function lengthThresholdMs(answerLength: number, baseMs = DEFAULT_BASE_MS): number {
  return baseMs + PER_CHAR_MS * Math.max(1, answerLength);
}

/**
 * Self-calibrating base: median of the learner's last 50 correct reaction times,
 * minus the length component, clamped to a sane range. Falls back to the default.
 */
export function calibrateBase(
  recent: readonly { reactionMs: number; answerLength: number }[],
): number {
  const last = recent.slice(-50);
  if (last.length < 10) return DEFAULT_BASE_MS;
  const bases = last
    .map((r) => r.reactionMs - PER_CHAR_MS * Math.max(1, r.answerLength))
    .sort((a, b) => a - b);
  const mid = Math.floor(bases.length / 2);
  const median =
    bases.length % 2
      ? (bases[mid] as number)
      : ((bases[mid - 1] as number) + (bases[mid] as number)) / 2;
  return Math.min(6000, Math.max(800, Math.round(median)));
}

/** Grade from the length formula: <1× Easy, <2× Good, <4× Hard, else Again. */
export function gradeByLength(
  reactionMs: number,
  correct: boolean,
  answerLength: number,
  baseMs = DEFAULT_BASE_MS,
): Grade {
  if (!correct) return 4;
  const t = lengthThresholdMs(answerLength, baseMs);
  if (reactionMs < t) return 1;
  if (reactionMs < 2 * t) return 2;
  if (reactionMs < 4 * t) return 3;
  return 4;
}

/** Grade against the word's own history: <0.8× Easy, ≤1.2× Good, ≤2× Hard, else Again. */
export function gradeByProfile(reactionMs: number, correct: boolean, emaMs: number): Grade {
  if (!correct) return 4;
  const r = reactionMs / emaMs;
  if (r < 0.8) return 1;
  if (r <= 1.2) return 2;
  if (r <= 2) return 3;
  return 4;
}

export interface GradeInput {
  reactionMs: number;
  correct: boolean;
  answerLength: number;
  profile?: Pick<ResponseProfile, "emaMs" | "n"> | null;
  baseMs?: number;
}

/** Chooses the profile rule once a word has enough own measurements, else the length rule. */
export function inferGrade(input: GradeInput): Grade {
  const p = input.profile;
  if (p && p.n >= PROFILE_MIN_N && p.emaMs > 0)
    return gradeByProfile(input.reactionMs, input.correct, p.emaMs);
  return gradeByLength(input.reactionMs, input.correct, input.answerLength, input.baseMs);
}

/** Exponential moving average update (new answer weighs 30 %). Only correct, non-manual answers feed it. */
export function updateProfile(
  prev: ResponseProfile | undefined,
  variantId: string,
  promptKind: PromptKind,
  reactionMs: number,
): ResponseProfile {
  if (!prev || prev.n === 0) return { variantId, promptKind, emaMs: reactionMs, n: 1 };
  return {
    variantId,
    promptKind,
    emaMs: Math.round(EMA_ALPHA * reactionMs + (1 - EMA_ALPHA) * prev.emaMs),
    n: prev.n + 1,
  };
}
