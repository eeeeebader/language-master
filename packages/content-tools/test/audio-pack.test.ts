import { storyAudioTexts } from "@lm/schema";
import { describe, expect, it } from "vitest";
import { audioKey, createAudioPackSchema, insertClip, packAudioTexts } from "../src/audio-pack";
import { buildPack } from "../src/pack";
import { openNodeSqlite } from "../src/sqlite";

const hasSqlite = await import("node:sqlite").then(() => true).catch(() => false);

describe("audio pack", () => {
  it("keys clips by the exact voiced text with collapsed whitespace", () => {
    expect(audioKey("  el   perro ")).toBe("el perro");
    expect(audioKey("canción")).toBe("canción");
  });

  it.skipIf(!hasSqlite)(
    "collects headwords, plurals and feminine forms and stores clips",
    async () => {
      const db = await openNodeSqlite(":memory:");
      buildPack(
        db,
        [
          {
            id: "es:perro",
            language: "es",
            lemma: "perro",
            pos: "noun",
            gender: "m",
            article: "el",
            plural: "los perros",
            genderPair: ["perro", "perra"],
            glosses: [{ text: "Hund" }],
            examples: [],
            tags: [],
          },
          {
            id: "es:hola",
            language: "es",
            lemma: "hola",
            pos: "intj",
            glosses: [{ text: "hallo" }],
            examples: [],
            tags: [],
          },
        ],
        { target: "es", native: "de", version: "1" },
      );
      expect(packAudioTexts(db).sort()).toEqual(["hola", "perra", "perro", "perros"]);
      const audio = await openNodeSqlite(":memory:");
      createAudioPackSchema(audio, { version: "1" });
      insertClip(audio, "perro", "audio/mpeg", new Uint8Array([1, 2, 3]), 700);
      const row = audio.all<{ key: string; ms: number }>("SELECT key, ms FROM audio")[0];
      expect(row).toEqual({ key: "perro", ms: 700 });
      audio.close();
      db.close();
    },
  );

  it("voices every word form, sentence and the whole story once", () => {
    const w = (text: string, ws = " ") => ({
      text,
      lemma: text,
      pos: "other" as const,
      ws,
      isWord: true,
    });
    const dot = { text: ".", lemma: ".", pos: "other" as const, ws: "", isWord: false };
    const doc = {
      paragraphs: [
        [
          { id: "a", translation: "", tokens: [w("Hola", ""), dot] },
          { id: "b", translation: "", tokens: [w("Hola"), w("Ana", ""), dot] },
        ],
      ],
    };
    const texts = storyAudioTexts(doc);
    expect(texts).toEqual(["Hola", "Hola.", "Ana", "Hola Ana.", "Hola. Hola Ana."]);
  });
});
