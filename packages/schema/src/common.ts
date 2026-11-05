import { z } from "zod";

/** Study languages the client knows how to handle. Spanish ships first. */
export const StudyLanguage = z.enum(["es"]);
export type StudyLanguage = z.infer<typeof StudyLanguage>;

/** Native (UI) languages. German only in v1. */
export const NativeLanguage = z.enum(["de"]);
export type NativeLanguage = z.infer<typeof NativeLanguage>;

export const IsoDateTime = z.string().datetime({ offset: true });
export const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ulid");

/** The five semantic grammar colours used by reader, lectures and dictionary. */
export const GrammarColour = z.enum(["sage", "rose", "lavender", "amber", "sky"]);
export type GrammarColour = z.infer<typeof GrammarColour>;

export const PartOfSpeech = z.enum([
  "noun",
  "verb",
  "adj",
  "adv",
  "pron",
  "det",
  "prep",
  "conj",
  "num",
  "intj",
  "phrase",
  "other",
]);
export type PartOfSpeech = z.infer<typeof PartOfSpeech>;

export const Gender = z.enum(["m", "f", "mf"]);
export type Gender = z.infer<typeof Gender>;
