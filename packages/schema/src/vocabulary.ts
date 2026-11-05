import { z } from "zod";
import { Gender, IsoDateTime, PartOfSpeech, StudyLanguage } from "./common";

/** One dictionary entry per lemma (the offline pack row shape). */
export const DictionaryEntry = z.object({
  id: z.string(),
  language: StudyLanguage,
  lemma: z.string(),
  pos: PartOfSpeech,
  gender: Gender.optional(),
  article: z.string().optional(),
  plural: z.string().optional(),
  /** Feminine / masculine pair, e.g. encantado / encantada */
  genderPair: z.tuple([z.string(), z.string()]).optional(),
  ipa: z.string().optional(),
  glosses: z.array(z.object({ text: z.string(), note: z.string().optional() })).min(1),
  examples: z
    .array(z.object({ text: z.string(), translation: z.string() }))
    .max(3)
    .default([]),
  /** Conjugation table: tense -> six person forms (yo, tú, él, nosotros, vosotros, ellos) */
  conjugations: z.record(z.string(), z.array(z.string()).length(6)).optional(),
  frequencyRank: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
});
export type DictionaryEntry = z.infer<typeof DictionaryEntry>;

export const VariantKind = z.enum([
  "lemma",
  "article",
  "plural",
  "conjugation",
  "gender_pair",
  "custom",
]);
export type VariantKind = z.infer<typeof VariantKind>;

/** Canonical word record per user + language. Scheduler fields are derived from review events. */
export const UserWord = z.object({
  id: z.string(),
  language: StudyLanguage,
  lemma: z.string(),
  translation: z.string(),
  pos: PartOfSpeech.default("other"),
  dictionaryRef: z.string().optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable().default(null),
});
export type UserWord = z.infer<typeof UserWord>;

export const CardVariant = z.object({
  id: z.string(),
  wordId: z.string(),
  kind: VariantKind,
  front: z.string(),
  back: z.string(),
  createdAt: IsoDateTime,
});
export type CardVariant = z.infer<typeof CardVariant>;

export const SentenceSource = z.enum(["story", "dictionary", "own"]);

export const WordSentence = z.object({
  id: z.string(),
  wordId: z.string(),
  position: z.number().int().min(1).max(5),
  text: z.string(),
  translation: z.string(),
  source: SentenceSource,
  storyId: z.string().optional(),
});
export type WordSentence = z.infer<typeof WordSentence>;

export const WordList = z.object({
  id: z.string(),
  language: StudyLanguage,
  title: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
  colour: z.enum(["sage", "rose", "lavender", "amber", "sky"]).default("sage"),
  isSystem: z.boolean().default(false),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable().default(null),
});
export type WordList = z.infer<typeof WordList>;

export const ListWord = z.object({
  listId: z.string(),
  wordId: z.string(),
  position: z.number().int().nonnegative(),
  addedAt: IsoDateTime,
});
export type ListWord = z.infer<typeof ListWord>;
