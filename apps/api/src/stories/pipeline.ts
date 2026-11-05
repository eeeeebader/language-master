import {
  type GrammarSpan,
  type StoryDocument,
  StoryDocument as StoryDocumentSchema,
  type StoryRequest,
  type StorySentence,
} from "@lm/schema";
import { checkStory, pruneSpans } from "./checks";
import {
  estimateCostCents,
  type Llm,
  type NotesOutput,
  type Usage,
  type WriterOutput,
} from "./llm";
import { type Annotate, type Annotation, mapPos } from "./nlp";
import { FAILED_COUNT, notesSystemPrompt, writerSystemPrompt, writerUserPrompt } from "./prompts";

export interface PipelineInput {
  storyId: string;
  request: StoryRequest;
  /** Up to ~600 strongest known lemmas, chosen by the caller from the learner's words. */
  knownLemmas: string[];
  /** Recently failed lemmas; the pipeline takes as many as the request asks for. */
  failedLemmas: string[];
  now?: Date;
}

export interface UsageRow extends Usage {
  step: "write" | "notes" | "moderation";
  costCents: number;
}

export type PipelineResult =
  | { ok: true; document: StoryDocument; usage: UsageRow[]; attempts: number; coverage: number }
  | { ok: false; reason: string; usage: UsageRow[]; attempts: number };

const LANGUAGE_NAMES: Record<string, string> = { es: "Spanish", de: "German" };

/** Build the StoryDocument skeleton from spaCy output: exact tokens, lemmas and POS. */
export function assembleDocument(
  input: PipelineInput,
  written: WriterOutput,
  annotated: Annotation[],
): StoryDocument {
  let n = 0;
  const paragraphs: StorySentence[][] = annotated.map((p) =>
    p.sentences.map((s) => ({
      id: `s${++n}`,
      translation: "",
      tokens: s.tokens.map((t) => ({
        text: t.text,
        lemma: t.lemma,
        pos: mapPos(t.pos),
        ws: t.ws,
        isWord: t.isWord,
      })),
    })),
  );
  return {
    id: input.storyId,
    language: input.request.language,
    native: input.request.native,
    title: written.title,
    theme: input.request.theme,
    grammarFocus: input.request.grammarFocus,
    level: input.request.level,
    source: "ai",
    createdAt: (input.now ?? new Date()).toISOString(),
    paragraphs,
    spans: [],
  };
}

/** Merge the second LLM pass (translations, glosses, spans) into the skeleton. */
export function applyNotes(doc: StoryDocument, notes: NotesOutput): StoryDocument {
  const byId = new Map(doc.paragraphs.flat().map((s) => [s.id, s]));
  for (const t of notes.translations) {
    const s = byId.get(t.sentenceId);
    if (s) s.translation = t.translation;
  }
  for (const g of notes.glosses) {
    const tok = byId.get(g.sentenceId)?.tokens[g.index];
    if (tok) tok.gloss = g.gloss;
  }
  const spans: GrammarSpan[] = notes.spans.map((sp, i) => ({ id: `sp${i + 1}`, ...sp }));
  return pruneSpans({ ...doc, spans });
}

/** Compact token listing the notes model receives; indices are what spans must reference. */
export function notesUserPrompt(doc: StoryDocument, request: StoryRequest): string {
  const lines: string[] = [`Grammar focus: ${request.grammarFocus}.`, ""];
  for (const s of doc.paragraphs.flat()) {
    lines.push(
      `${s.id}: ${s.tokens.map((t, i) => `${i}:${t.text}(${t.lemma}/${t.pos})`).join(" ")}`,
    );
  }
  return lines.join("\n");
}

export function createPipeline(llm: Llm, annotate: Annotate) {
  return async function generate(input: PipelineInput): Promise<PipelineResult> {
    const usage: UsageRow[] = [];
    const rec = (step: UsageRow["step"], u: Usage) =>
      usage.push({ ...u, step, costCents: estimateCostCents(u.model, u.tokensIn, u.tokensOut) });
    const failed = [...new Set([...input.request.pickedFailed, ...input.failedLemmas])].slice(
      0,
      Math.max(FAILED_COUNT[input.request.failedWords], input.request.pickedFailed.length),
    );
    const targetName = LANGUAGE_NAMES[input.request.language] ?? input.request.language;
    const nativeName = LANGUAGE_NAMES[input.request.native] ?? input.request.native;
    let feedback: string | undefined;
    let attempts = 0;

    while (attempts < 2) {
      attempts++;
      // 1. write
      const written = await llm.write(
        writerSystemPrompt(),
        writerUserPrompt({
          request: input.request,
          knownLemmas: input.knownLemmas,
          failedLemmas: failed,
          languageName: targetName,
          feedback,
        }),
      );
      rec("write", written.usage);

      // 2. moderation (cheap classifier) before anything is stored
      const mod = await llm.moderate(
        `${written.output.title}\n\n${written.output.paragraphs.join("\n\n")}`,
      );
      rec("moderation", mod.usage);
      if (!mod.safe) {
        feedback =
          "The previous text was rejected by content moderation. Keep it strictly family-friendly and fictional.";
        continue;
      }

      // 3. deterministic NLP pass
      const annotated = await annotate(written.output.paragraphs, input.request.language);
      const skeleton = assembleDocument(input, written.output, annotated);

      // 4. tolerant checks: only far-off stories retry
      const check = checkStory(skeleton, input.request, input.knownLemmas, failed);
      if (!check.ok) {
        feedback = check.feedback ?? undefined;
        continue;
      }

      // 5. grammar notes with structured output
      const notes = await llm.notes(
        notesSystemPrompt(nativeName),
        notesUserPrompt(skeleton, input.request),
      );
      rec("notes", notes.usage);
      const merged = applyNotes(skeleton, notes.output);

      // 6. schema validation is the hard gate
      const parsed = StoryDocumentSchema.safeParse(merged);
      if (!parsed.success) {
        feedback =
          "The previous attempt produced an invalid document structure; keep sentences simple and well separated.";
        continue;
      }
      return { ok: true, document: parsed.data, usage, attempts, coverage: check.coverage };
    }
    return { ok: false, reason: feedback ?? "generation failed", usage, attempts };
  };
}
