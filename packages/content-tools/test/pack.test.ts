import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Lecture } from "@lm/schema";
import { afterAll, describe, expect, it } from "vitest";
import {
  audioTexts,
  buildPack,
  DictClient,
  fromKaikki,
  type KaikkiLine,
  type Overrides,
  openNodeSqlite,
  validateLectures,
} from "../src";

let sqliteAvailable = true;
try {
  await import("node:sqlite");
} catch {
  sqliteAvailable = false;
}

const dir = mkdtempSync(join(tmpdir(), "lm-pack-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const lines = readFileSync(new URL("../fixtures/kaikki-sample.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as KaikkiLine);
const overrides = JSON.parse(
  readFileSync(new URL("../fixtures/overrides.es-de.example.json", import.meta.url), "utf8"),
) as Overrides;

describe("kaikki mapping", () => {
  it("maps nouns, adjectives and verbs; skips other languages and entries without German", () => {
    const entries = lines.map((l) => fromKaikki(l, "de", overrides)).filter((e) => !!e);
    expect(entries.map((e) => e.lemma)).toEqual([
      "perro",
      "casa",
      "encantado",
      "ser",
      "corazón",
      "hola",
      "gracias",
      "rojo",
      "sinónimo",
    ]);
    const perro = entries.find((e) => e.lemma === "perro");
    expect(perro?.gender).toBe("m");
    expect(perro?.article).toBe("el");
    expect(perro?.plural).toBe("los perros");
    expect(perro?.ipa).toBe("ˈpero");
    expect(perro?.examples[0]?.translation).toContain("Hund");
    expect(entries.find((e) => e.lemma === "encantado")?.genderPair).toEqual([
      "encantado",
      "encantada",
    ]);
    expect(entries.find((e) => e.lemma === "ser")?.conjugations?.Präsens).toEqual([
      "soy",
      "eres",
      "es",
      "somos",
      "sois",
      "son",
    ]);
    expect(entries.find((e) => e.lemma === "sinónimo")?.glosses[0]?.text).toBe("Synonym");
  });
});

describe.skipIf(!sqliteAvailable)("pack build + query (node:sqlite)", () => {
  it("builds a pack and searches it prefix, fuzzy and accent-insensitively", async () => {
    const file = join(dir, "es-de.v1.sqlite");
    const db = await openNodeSqlite(file);
    const entries = lines.map((l) => fromKaikki(l, "de", overrides)).filter((e) => !!e);
    expect(buildPack(db, entries, { target: "es", native: "de", version: "1" })).toBe(9);
    const client = new DictClient(db);
    expect(client.meta().version).toBe("1");
    expect(client.getEntry("es:perro")?.glosses[0]?.text).toBe("Hund");
    expect(client.search("corazon")[0]?.lemma).toBe("corazón");
    expect(client.search("encant").map((e) => e.lemma)).toContain("encantado");
    expect(client.search("perrp")[0]?.lemma).toBe("perro");
    expect(client.search("Hund")[0]?.lemma).toBe("perro");
    expect(client.search("somos")[0]?.lemma).toBe("ser");
    expect(client.getByLemma("CASA")?.plural).toBe("las casas");
    db.close();
  });
});

describe("lecture validation", () => {
  const lecture = {
    id: "es-x",
    language: "es",
    slug: "x",
    title: { de: "X" },
    summary: { de: "Y" },
    blocks: [
      { id: "b1", type: "vocab_bundle", title: { de: "V" }, lemmas: ["perro", "unicornio"] },
      {
        id: "b2",
        type: "dialogue",
        lines: [{ speaker: "A", text: "Hola", translation: { de: "Hallo" } }],
      },
    ],
  };
  it("reports unknown lemmas and schema errors", () => {
    const issues = validateLectures(
      [
        { file: "x.json", json: lecture },
        { file: "bad.json", json: { id: 1 } },
      ],
      (l) => l === "perro",
    );
    expect(issues.map((i) => i.file)).toEqual(["bad.json", "x.json"]);
    expect(issues[1]?.message).toContain("unicornio");
  });
  it("collects audio texts", () => {
    expect(audioTexts(Lecture.parse(lecture))).toEqual([{ id: "es-x.b2.0", text: "Hola" }]);
  });
});
