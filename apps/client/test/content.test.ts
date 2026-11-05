import { DictionaryEntry, Lecture, StoryDocument } from "@lm/schema";
import { describe, expect, it } from "vitest";
import { DICTIONARY_ES, STARTER_LEMMAS } from "../src/data/dictionary-es";
import { LECTURES_ES } from "../src/data/lectures-es";
import { OFFICIAL_STORIES } from "../src/data/stories-es";
import { getEntryByLemma, searchDictionary, variantOptions } from "../src/lib/dictionary";

describe("content validates against the shared schema", () => {
  it("dictionary entries", () => {
    for (const e of DICTIONARY_ES) expect(() => DictionaryEntry.parse(e), e.lemma).not.toThrow();
    const lemmas = DICTIONARY_ES.map((e) => e.lemma);
    expect(new Set(lemmas).size).toBe(lemmas.length);
  });

  it("starter list lemmas exist", () => {
    for (const l of STARTER_LEMMAS) expect(getEntryByLemma(l), l).toBeDefined();
  });

  it("lectures and their vocab bundles", () => {
    const ids = new Set(LECTURES_ES.map((l) => l.id));
    for (const l of LECTURES_ES) {
      expect(() => Lecture.parse(l), l.slug).not.toThrow();
      for (const r of l.requires) expect(ids.has(r), `${l.slug} requires ${r}`).toBe(true);
      for (const b of l.blocks)
        if (b.type === "vocab_bundle")
          for (const lemma of b.lemmas)
            expect(getEntryByLemma(lemma), `${l.slug}: ${lemma}`).toBeDefined();
      for (const b of l.blocks)
        if (b.type === "quick_check")
          for (const q of b.questions) expect(q.answer).toBeLessThan(q.options.length);
    }
  });

  it("stories: spans resolve to token ranges", () => {
    for (const s of OFFICIAL_STORIES) {
      expect(() => StoryDocument.parse(s), s.id).not.toThrow();
      const sentences = new Map(s.paragraphs.flat().map((x) => [x.id, x]));
      for (const sp of s.spans) {
        const sent = sentences.get(sp.sentenceId);
        expect(sent, sp.id).toBeDefined();
        expect(sp.to).toBeLessThanOrEqual(sent?.tokens.length ?? 0);
        if (sp.refSentenceId) expect(sentences.get(sp.refSentenceId), `${sp.id} ref`).toBeDefined();
      }
    }
  });
});

describe("dictionary search", () => {
  it("is accent-insensitive and matches both gender forms", () => {
    expect(searchDictionary("encant").map((e) => e.lemma)).toContain("encantado");
    expect(searchDictionary("adios")[0]?.lemma).toBe("adiós");
    expect(searchDictionary("Hund")[0]?.lemma).toBe("perro");
    expect(searchDictionary("tengo")[0]?.lemma).toBe("tener");
  });

  it("offers article, plural and gender variants", () => {
    const kinds = variantOptions(getEntryByLemma("perro") as DictionaryEntry).map((v) => v.kind);
    expect(kinds).toEqual(expect.arrayContaining(["lemma", "article", "plural"]));
    const k2 = variantOptions(getEntryByLemma("encantado") as DictionaryEntry).map((v) => v.kind);
    expect(k2).toContain("gender_pair");
  });
});
