import { type StoryDocument, StoryDocument as StoryDocumentSchema } from "@lm/schema";
import { z } from "zod";
import { estimateCostCents, type Llm } from "../stories/llm";
import type { Annotate } from "../stories/nlp";
import {
  applyNotes,
  assembleDocument,
  notesUserPrompt,
  type UsageRow as Row,
} from "../stories/pipeline";
import { notesSystemPrompt } from "../stories/prompts";

export const OfficialInput = z.object({
  id: z.string().optional(),
  language: z.enum(["es"]),
  native: z.enum(["de"]).default("de"),
  title: z.string().min(1).max(120),
  theme: z.string().min(1),
  grammarFocus: z.string().default("Präsens"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  text: z.string().min(1).max(20_000),
});
export type OfficialInput = z.infer<typeof OfficialInput>;

export type OfficialResult =
  | { ok: true; document: StoryDocument; usage: Row[] }
  | { ok: false; reason: string; usage: Row[] };

const LANGUAGE_NAMES: Record<string, string> = { es: "Spanish", de: "German" };

/**
 * Official texts: pipeline steps 4 (spaCy), 6 (grammar notes), 7 (validation) and 8 (store) only.
 * No quota, no writer call, no moderation of our own curated text.
 */
export function createOfficialAnnotator(llm: Llm, annotate: Annotate) {
  return async function annotateOfficial(
    input: OfficialInput,
    now = new Date(),
  ): Promise<OfficialResult> {
    const usage: Row[] = [];
    const paragraphs = input.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) return { ok: false, reason: "empty text", usage };

    const storyId = input.id ?? `${input.language}-official-${slug(input.title)}`;
    const request = {
      language: input.language,
      native: input.native,
      novelty: 0.1,
      failedWords: "off" as const,
      pickedFailed: [],
      level: input.level,
      length: 1 as const,
      theme: input.theme as never,
      grammarFocus: input.grammarFocus,
      sourceLists: [],
    };
    const annotated = await annotate(paragraphs, input.language);
    const skeleton = assembleDocument(
      { storyId, request, knownLemmas: [], failedLemmas: [], now },
      { title: input.title, paragraphs },
      annotated,
    );
    skeleton.source = "official";

    const notes = await llm.notes(
      notesSystemPrompt(LANGUAGE_NAMES[input.native] ?? input.native),
      notesUserPrompt(skeleton, request),
    );
    usage.push({
      ...notes.usage,
      step: "notes",
      costCents: estimateCostCents(notes.usage.model, notes.usage.tokensIn, notes.usage.tokensOut),
    });
    const merged = applyNotes(skeleton, notes.output);
    const parsed = StoryDocumentSchema.safeParse(merged);
    if (!parsed.success) {
      return { ok: false, reason: `invalid document: ${parsed.error.issues[0]?.message}`, usage };
    }
    return { ok: true, document: parsed.data, usage };
  };
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
