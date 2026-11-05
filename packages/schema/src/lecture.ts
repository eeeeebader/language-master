import { z } from "zod";
import { GrammarColour, NativeLanguage, StudyLanguage } from "./common";

const I18n = z.record(NativeLanguage, z.string());
const Base = { id: z.string(), audio: z.string().optional() };

export const HeadingBlock = z.object({
  ...Base,
  type: z.literal("heading"),
  text: I18n,
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});
export const ProseBlock = z.object({ ...Base, type: z.literal("prose"), markdown: I18n });
export const AlphabetGridBlock = z.object({
  ...Base,
  type: z.literal("alphabet_grid"),
  letters: z.array(
    z.object({
      glyph: z.string(),
      ipa: z.string(),
      audio: z.string().optional(),
      example: z.string(),
      translation: I18n,
    }),
  ),
});
export const NumberTableBlock = z.object({
  ...Base,
  type: z.literal("number_table"),
  rows: z.array(z.object({ value: z.number(), word: z.string(), audio: z.string().optional() })),
  patternNote: I18n.optional(),
});
export const RuleCardBlock = z.object({
  ...Base,
  type: z.literal("rule_card"),
  title: I18n,
  rule: I18n,
  examples: z.array(z.object({ text: z.string(), translation: I18n })).default([]),
  exceptions: z.array(z.object({ text: z.string(), translation: I18n })).default([]),
  colour: GrammarColour.default("sage"),
});
export const PatternBuilderBlock = z.object({
  ...Base,
  type: z.literal("pattern_builder"),
  intro: I18n.optional(),
  slots: z.array(z.object({ label: I18n, options: z.array(z.string()).min(1) })),
});
export const ConjugationMiniBlock = z.object({
  ...Base,
  type: z.literal("conjugation_mini"),
  verb: z.string(),
  tense: I18n,
  persons: z
    .array(z.object({ person: z.string(), form: z.string(), audio: z.string().optional() }))
    .length(6),
});
export const DialogueBlock = z.object({
  ...Base,
  type: z.literal("dialogue"),
  lines: z.array(
    z.object({
      speaker: z.string(),
      text: z.string(),
      translation: I18n,
      audio: z.string().optional(),
    }),
  ),
});
export const CompareBlock = z.object({
  ...Base,
  type: z.literal("compare"),
  left: I18n,
  right: I18n,
  rows: z.array(z.tuple([z.string(), z.string()])),
});
export const ConstraintVisualBlock = z.object({
  ...Base,
  type: z.literal("constraint_visual"),
  kind: z.enum(["agreement", "word_order", "stress"]),
  tokens: z.array(
    z.object({
      text: z.string(),
      colour: GrammarColour.optional(),
      stressed: z.boolean().optional(),
    }),
  ),
  links: z.array(z.tuple([z.number(), z.number()])).default([]),
  caption: I18n.optional(),
});
export const QuickCheckBlock = z.object({
  ...Base,
  type: z.literal("quick_check"),
  questions: z
    .array(
      z.object({
        prompt: I18n,
        options: z.array(z.string()).min(2).max(4),
        answer: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(3),
});
export const VocabBundleBlock = z.object({
  ...Base,
  type: z.literal("vocab_bundle"),
  title: I18n,
  lemmas: z.array(z.string()).min(1),
});

export const LectureBlock = z.discriminatedUnion("type", [
  HeadingBlock,
  ProseBlock,
  AlphabetGridBlock,
  NumberTableBlock,
  RuleCardBlock,
  PatternBuilderBlock,
  ConjugationMiniBlock,
  DialogueBlock,
  CompareBlock,
  ConstraintVisualBlock,
  QuickCheckBlock,
  VocabBundleBlock,
]);
export type LectureBlock = z.infer<typeof LectureBlock>;

export const Lecture = z.object({
  id: z.string(),
  language: StudyLanguage,
  slug: z.string(),
  version: z.number().int().positive().default(1),
  title: I18n,
  summary: I18n,
  /** Minutes of reading */
  minutes: z.number().int().positive().default(3),
  requires: z.array(z.string()).default([]),
  /** Horizontal offset -1..1 on the path canvas */
  offset: z.number().min(-1).max(1).default(0),
  edgeHint: I18n.optional(),
  blocks: z.array(LectureBlock).min(1),
});
export type Lecture = z.infer<typeof Lecture>;
