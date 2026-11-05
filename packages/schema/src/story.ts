import { z } from "zod";
import { GrammarColour, IsoDateTime, NativeLanguage, PartOfSpeech, StudyLanguage } from "./common";

export const StoryToken = z.object({
  /** Surface text as it appears */
  text: z.string(),
  lemma: z.string(),
  pos: PartOfSpeech,
  /** Contextual translation for this occurrence */
  gloss: z.string().optional(),
  /** Whitespace following the token */
  ws: z.string().default(" "),
  isWord: z.boolean().default(true),
});
export type StoryToken = z.infer<typeof StoryToken>;

export const StorySentence = z.object({
  id: z.string(),
  tokens: z.array(StoryToken).min(1),
  translation: z.string(),
});
export type StorySentence = z.infer<typeof StorySentence>;

/** A grammar highlight over exact token spans; can reference another sentence. */
export const GrammarSpan = z.object({
  id: z.string(),
  sentenceId: z.string(),
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
  colour: GrammarColour,
  title: z.string(),
  note: z.string(),
  refSentenceId: z.string().optional(),
  refFrom: z.number().int().nonnegative().optional(),
  refTo: z.number().int().positive().optional(),
});
export type GrammarSpan = z.infer<typeof GrammarSpan>;

export const StoryDocument = z.object({
  id: z.string(),
  language: StudyLanguage,
  native: NativeLanguage,
  title: z.string(),
  theme: z.string(),
  grammarFocus: z.string().optional(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  source: z.enum(["ai", "official"]),
  createdAt: IsoDateTime,
  paragraphs: z.array(z.array(StorySentence).min(1)).min(1),
  spans: z.array(GrammarSpan).default([]),
});
export type StoryDocument = z.infer<typeof StoryDocument>;

export const StoryTheme = z.enum([
  "coming_of_age",
  "daily_shopping",
  "daily_working",
  "daily_transport",
  "daily_friends",
  "diary",
  "fiction",
  "detective",
  "romance",
  "cooking",
  "hobbies",
  "surprise",
]);
export type StoryTheme = z.infer<typeof StoryTheme>;

/** Generation request: enums and lemma lists only, no free text. */
export const StoryRequest = z.object({
  language: StudyLanguage,
  native: NativeLanguage,
  novelty: z.number().min(0).max(1),
  failedWords: z.enum(["off", "few", "some", "many"]),
  pickedFailed: z.array(z.string()).max(10).default([]),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  length: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  theme: StoryTheme,
  grammarFocus: z.string(),
  sourceLists: z.array(z.string()),
});
export type StoryRequest = z.infer<typeof StoryRequest>;
