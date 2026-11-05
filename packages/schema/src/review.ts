import { z } from "zod";
import { IsoDateTime } from "./common";

/** 1 = Easy (instant), 2 = Good, 3 = Hard, 4 = Again. Maps onto FSRS grades exactly. */
export const Grade = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Grade = z.infer<typeof Grade>;

export const SessionMode = z.enum(["classic", "reaction", "progressive", "forever"]);
export type SessionMode = z.infer<typeof SessionMode>;

export const PromptKind = z.enum(["choice", "native_to_target", "target_to_native"]);
export type PromptKind = z.infer<typeof PromptKind>;

/** Immutable review log entry. An override writes a new event with supersedes = old id. */
export const ReviewEvent = z.object({
  id: z.string(),
  variantId: z.string(),
  wordId: z.string(),
  grade: Grade,
  reactionMs: z.number().int().nonnegative().nullable(),
  mode: SessionMode,
  promptKind: PromptKind.nullable(),
  reviewedAt: IsoDateTime,
  supersedes: z.string().nullable().default(null),
  /** true when the grade was chosen by hand (manual mode or override); excluded from response profiles */
  manual: z.boolean().default(false),
  synced: z.boolean().default(false),
});
export type ReviewEvent = z.infer<typeof ReviewEvent>;

/** Derived FSRS state cache per variant. Recomputed from the log whenever they disagree. */
export const CardState = z.object({
  variantId: z.string(),
  wordId: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  due: IsoDateTime,
  lastReview: IsoDateTime.nullable(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  /** 0 new, 1 learning, 2 review, 3 relearning (FSRS states) */
  state: z.number().int().min(0).max(3),
  elapsedDays: z.number().nonnegative(),
  scheduledDays: z.number().nonnegative(),
});
export type CardState = z.infer<typeof CardState>;

export const ResponseProfile = z.object({
  variantId: z.string(),
  promptKind: PromptKind,
  emaMs: z.number().nonnegative(),
  n: z.number().int().nonnegative(),
});
export type ResponseProfile = z.infer<typeof ResponseProfile>;
