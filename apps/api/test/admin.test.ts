import { describe, expect, it } from "vitest";
import { canEnablePair, mergeFlag } from "../src/admin/languages";
import { createOfficialAnnotator, slug } from "../src/admin/official";
import type { Llm, NotesOutput } from "../src/stories/llm";
import type { Annotate, Annotation } from "../src/stories/nlp";

const ANNOTATED: Annotation[] = [
  {
    sentences: [
      {
        text: "Ana va al mercado.",
        tokens: [
          { text: "Ana", lemma: "Ana", pos: "noun", ws: " ", isWord: true },
          { text: "va", lemma: "ir", pos: "verb", ws: " ", isWord: true },
          { text: "al", lemma: "al", pos: "prep", ws: " ", isWord: true },
          { text: "mercado", lemma: "mercado", pos: "noun", ws: "", isWord: true },
          { text: ".", lemma: ".", pos: "other", ws: "", isWord: false },
        ],
      },
    ],
  },
];

const NOTES: NotesOutput = {
  translations: [{ sentenceId: "s1", translation: "Ana geht zum Markt." }],
  glosses: [{ sentenceId: "s1", index: 1, gloss: "geht" }],
  spans: [{ sentenceId: "s1", from: 1, to: 2, colour: "sage", title: "ir", note: "va = geht" }],
};

const llm: Llm = {
  write: async () => {
    throw new Error("official texts never call the writer");
  },
  notes: async () => ({ output: NOTES, usage: { model: "fake", tokensIn: 1, tokensOut: 1 } }),
  moderate: async () => {
    throw new Error("official texts are not moderated");
  },
};
const annotate: Annotate = async () => ANNOTATED;

describe("official text annotation (steps 4, 6, 7)", () => {
  it("builds a valid official StoryDocument without writer or quota", async () => {
    const run = createOfficialAnnotator(llm, annotate);
    const r = await run(
      {
        language: "es",
        native: "de",
        title: "Un día en el mercado",
        theme: "daily_shopping",
        grammarFocus: "Präsens",
        level: 1,
        text: "Ana va al mercado.",
      },
      new Date("2026-11-05T10:00:00Z"),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.source).toBe("official");
    expect(r.document.id).toBe("es-official-un-dia-en-el-mercado");
    expect(r.document.paragraphs[0]?.[0]?.translation).toBe("Ana geht zum Markt.");
    expect(r.document.paragraphs[0]?.[0]?.tokens[1]?.gloss).toBe("geht");
    expect(r.document.paragraphs[0]?.[0]?.tokens[1]?.pos).toBe("verb");
    expect(r.document.spans).toHaveLength(1);
    expect(r.usage.map((u) => u.step)).toEqual(["notes"]);
  });

  it("rejects empty text", async () => {
    const run = createOfficialAnnotator(llm, annotate);
    const r = await run({
      language: "es",
      native: "de",
      title: "x",
      theme: "diary",
      grammarFocus: "Präsens",
      level: 1,
      text: "   \n\n  ",
    });
    expect(r.ok).toBe(false);
  });

  it("slugs titles accent-insensitively", () => {
    expect(slug("¡Hola, señor García!")).toBe("hola-senor-garcia");
  });
});

describe("languages and flags", () => {
  it("enables a pair only with a published pack and eight lectures", () => {
    expect(canEnablePair({ hasPublishedPack: false, publishedLectures: 12 }).ok).toBe(false);
    expect(canEnablePair({ hasPublishedPack: true, publishedLectures: 7 }).ok).toBe(false);
    expect(canEnablePair({ hasPublishedPack: true, publishedLectures: 8 }).ok).toBe(true);
  });

  it("merges flag patches, clamps percentage and de-duplicates users", () => {
    const a = mergeFlag(null, { key: "stories_v2", percentage: 150 });
    expect(a).toEqual({ key: "stories_v2", enabled: false, percentage: 100, users: [] });
    const b = mergeFlag(a, { key: "stories_v2", enabled: true, users: ["u1", "u1", "u2"] });
    expect(b.enabled).toBe(true);
    expect(b.percentage).toBe(100);
    expect(b.users).toEqual(["u1", "u2"]);
  });
});
