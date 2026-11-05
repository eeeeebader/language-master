import type { StoryRequest } from "@lm/schema";
import { describe, expect, it } from "vitest";
import { checkStory, pruneSpans } from "../src/stories/checks";
import type { Llm, NotesOutput, WriterOutput } from "../src/stories/llm";
import type { Annotate, Annotation } from "../src/stories/nlp";
import { assembleDocument, createPipeline } from "../src/stories/pipeline";

// Recorded outputs: what the writer, spaCy and the notes model returned for one real run.
const WRITTEN: WriterOutput = {
  title: "Un café con Ana",
  paragraphs: ["Ana va al mercado. Compra pan y queso.", "El perro duerme en casa."],
};

const ANNOTATED: Annotation[] = [
  {
    sentences: [
      {
        text: "Ana va al mercado.",
        tokens: [
          t("Ana", "Ana", "PROPN"),
          t("va", "ir", "VERB"),
          t("al", "al", "ADP"),
          t("mercado", "mercado", "NOUN", ""),
          t(".", ".", "PUNCT", "", false),
        ],
      },
      {
        text: "Compra pan y queso.",
        tokens: [
          t("Compra", "comprar", "VERB"),
          t("pan", "pan", "NOUN"),
          t("y", "y", "CCONJ"),
          t("queso", "queso", "NOUN", ""),
          t(".", ".", "PUNCT", "", false),
        ],
      },
    ],
  },
  {
    sentences: [
      {
        text: "El perro duerme en casa.",
        tokens: [
          t("El", "el", "DET"),
          t("perro", "perro", "NOUN"),
          t("duerme", "dormir", "VERB"),
          t("en", "en", "ADP"),
          t("casa", "casa", "NOUN", ""),
          t(".", ".", "PUNCT", "", false),
        ],
      },
    ],
  },
];

const NOTES: NotesOutput = {
  translations: [
    { sentenceId: "s1", translation: "Ana geht zum Markt." },
    { sentenceId: "s2", translation: "Sie kauft Brot und Käse." },
    { sentenceId: "s3", translation: "Der Hund schläft zu Hause." },
  ],
  glosses: [{ sentenceId: "s1", index: 1, gloss: "geht" }],
  spans: [
    { sentenceId: "s1", from: 1, to: 2, colour: "sage", title: "ir", note: "va = geht" },
    {
      sentenceId: "s2",
      from: 0,
      to: 1,
      colour: "lavender",
      title: "Wer?",
      note: "Subjekt weggelassen",
      refSentenceId: "s1",
      refFrom: 0,
      refTo: 1,
    },
    { sentenceId: "s9", from: 0, to: 1, colour: "sky", title: "bad", note: "unknown sentence" },
    { sentenceId: "s3", from: 4, to: 9, colour: "rose", title: "bad", note: "out of range" },
  ],
};

function t(text: string, lemma: string, pos: string, ws = " ", isWord = true) {
  return { text, lemma, pos, ws, isWord };
}

const request: StoryRequest = {
  language: "es",
  native: "de",
  novelty: 0.1,
  failedWords: "few",
  pickedFailed: [],
  level: 1,
  length: 1,
  theme: "daily_shopping",
  grammarFocus: "Präsens",
  sourceLists: [],
};
const KNOWN = ["ir", "al", "mercado", "comprar", "pan", "y", "queso", "el", "perro", "en", "casa"];

function fakeLlm(overrides: Partial<Llm> = {}): Llm {
  return {
    write: async () => ({
      output: WRITTEN,
      usage: { model: "fake", tokensIn: 100, tokensOut: 50 },
    }),
    notes: async () => ({ output: NOTES, usage: { model: "fake", tokensIn: 200, tokensOut: 80 } }),
    moderate: async () => ({ safe: true, usage: { model: "fake", tokensIn: 10, tokensOut: 1 } }),
    ...overrides,
  };
}
const annotate: Annotate = async () => ANNOTATED;

describe("story pipeline (golden)", () => {
  it("assembles exact tokens from spaCy and validates the document", async () => {
    const result = await createPipeline(
      fakeLlm(),
      annotate,
    )({ storyId: "st1", request, knownLemmas: KNOWN, failedLemmas: ["dormir"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.title).toBe("Un café con Ana");
    expect(result.document.paragraphs).toHaveLength(2);
    expect(result.document.paragraphs[0]?.[0]?.tokens[1]).toMatchObject({
      text: "va",
      lemma: "ir",
      pos: "verb",
      gloss: "geht",
    });
    expect(result.document.paragraphs[0]?.[1]?.translation).toBe("Sie kauft Brot und Käse.");
    // bad spans dropped, good ones kept with cross-sentence ref
    expect(result.document.spans.map((s) => s.title)).toEqual(["ir", "Wer?"]);
    expect(result.document.spans[1]?.refSentenceId).toBe("s1");
    expect(result.usage.map((u) => u.step)).toEqual(["write", "moderation", "notes"]);
    expect(result.attempts).toBe(1);
  });

  it("retries once with feedback when the story is far off target, then fails", async () => {
    let calls = 0;
    let lastPrompt = "";
    const llm = fakeLlm({
      write: async (_s, p) => {
        calls++;
        lastPrompt = p;
        return { output: WRITTEN, usage: { model: "fake", tokensIn: 1, tokensOut: 1 } };
      },
    });
    // an advanced learner (not a beginner) whose 60 known words do not appear in the text:
    // coverage stays far below the 90 % target, so the pipeline retries once and gives up
    const unrelated = Array.from({ length: 60 }, (_, i) => `palabra${i}`);
    const result = await createPipeline(
      llm,
      annotate,
    )({ storyId: "st2", request, knownLemmas: unrelated, failedLemmas: [] });
    expect(result.ok).toBe(false);
    expect(calls).toBe(2);
    expect(lastPrompt).toContain("Revision feedback");
  });

  it("fails when both attempts are rejected by moderation", async () => {
    const llm = fakeLlm({
      moderate: async () => ({ safe: false, usage: { model: "fake", tokensIn: 1, tokensOut: 1 } }),
    });
    const result = await createPipeline(
      llm,
      annotate,
    )({ storyId: "st3", request, knownLemmas: KNOWN, failedLemmas: [] });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(2);
  });
});

describe("checks", () => {
  it("accepts small deviations and requires at least one failed word when some were asked for", () => {
    const doc = assembleDocument(
      { storyId: "x", request, knownLemmas: KNOWN, failedLemmas: [] },
      WRITTEN,
      ANNOTATED,
    );
    const ok = checkStory(doc, request, KNOWN, ["dormir"]);
    expect(ok.ok).toBe(true);
    expect(ok.usedFailed).toEqual(["dormir"]);
    const missing = checkStory(doc, request, KNOWN, ["hablar", "vivir"]);
    expect(missing.ok).toBe(false);
    expect(missing.feedback).toContain("struggling words");
  });

  it("prunes spans with invalid ranges", () => {
    const doc = assembleDocument(
      { storyId: "x", request, knownLemmas: KNOWN, failedLemmas: [] },
      WRITTEN,
      ANNOTATED,
    );
    const pruned = pruneSpans({
      ...doc,
      spans: [
        { id: "a", sentenceId: "s1", from: 0, to: 99, colour: "sage", title: "", note: "" },
        { id: "b", sentenceId: "s1", from: 0, to: 1, colour: "sage", title: "", note: "" },
      ],
    });
    expect(pruned.spans.map((s) => s.id)).toEqual(["b"]);
  });
});
