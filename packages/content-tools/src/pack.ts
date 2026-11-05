import type { DictionaryEntry } from "@lm/schema";
import type { SqliteLike } from "./sqlite";

export const PACK_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lemma (
  id TEXT PRIMARY KEY, lemma TEXT NOT NULL, norm TEXT NOT NULL, pos TEXT NOT NULL,
  gender TEXT, article TEXT, plural TEXT, gender_pair TEXT, ipa TEXT, frequency_rank INTEGER, tags TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS lemma_norm ON lemma(norm);
CREATE TABLE IF NOT EXISTS form (lemma_id TEXT NOT NULL, kind TEXT NOT NULL, tense TEXT, person INTEGER, form TEXT NOT NULL, norm TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS form_norm ON form(norm);
CREATE TABLE IF NOT EXISTS sense (lemma_id TEXT NOT NULL, position INTEGER NOT NULL, gloss TEXT NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS example (lemma_id TEXT NOT NULL, position INTEGER NOT NULL, text TEXT NOT NULL, translation TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audio (lemma_id TEXT NOT NULL, form TEXT NOT NULL, file TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS search (lemma_id TEXT NOT NULL, norm TEXT NOT NULL, kind INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS search_norm ON search(norm, kind);
`;

export function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createPackSchema(db: SqliteLike, meta: Record<string, string>) {
  db.exec(PACK_SCHEMA);
  for (const [k, v] of Object.entries(meta))
    db.run("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [k, v]);
}

export interface ExtraForm {
  form: string;
  kind: "conjugation" | "plural" | "gender_pair" | "form";
}

export function insertEntry(db: SqliteLike, e: DictionaryEntry, extra: ExtraForm[] = []) {
  db.run(
    "INSERT OR REPLACE INTO lemma(id, lemma, norm, pos, gender, article, plural, gender_pair, ipa, frequency_rank, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [
      e.id,
      e.lemma,
      normalise(e.lemma),
      e.pos,
      e.gender ?? null,
      e.article ?? null,
      e.plural ?? null,
      e.genderPair ? JSON.stringify(e.genderPair) : null,
      e.ipa ?? null,
      e.frequencyRank ?? null,
      JSON.stringify(e.tags ?? []),
    ],
  );
  db.run("DELETE FROM form WHERE lemma_id = ?", [e.id]);
  db.run("DELETE FROM sense WHERE lemma_id = ?", [e.id]);
  db.run("DELETE FROM example WHERE lemma_id = ?", [e.id]);
  db.run("DELETE FROM search WHERE lemma_id = ?", [e.id]);
  // kind: 0 lemma, 1 form, 2 gloss (lower sorts first in results)
  const searchTexts = new Map<string, number>([[normalise(e.lemma), 0]]);
  const addText = (text: string, kind: number) => {
    const n = normalise(text);
    if (!n) return;
    const prev = searchTexts.get(n);
    if (prev === undefined || kind < prev) searchTexts.set(n, kind);
  };
  if (e.plural) {
    db.run("INSERT INTO form VALUES (?,?,?,?,?,?)", [
      e.id,
      "plural",
      null,
      null,
      e.plural,
      normalise(e.plural),
    ]);
    addText(e.plural.replace(/^(los|las|los\/las)\s+/, ""), 1);
  }
  if (e.genderPair) {
    db.run("INSERT INTO form VALUES (?,?,?,?,?,?)", [
      e.id,
      "gender_pair",
      null,
      null,
      e.genderPair[1],
      normalise(e.genderPair[1]),
    ]);
    addText(e.genderPair[1], 1);
  }
  for (const [tense, forms] of Object.entries(e.conjugations ?? {})) {
    forms.forEach((f, i) => {
      db.run("INSERT INTO form VALUES (?,?,?,?,?,?)", [
        e.id,
        "conjugation",
        tense,
        i,
        f,
        normalise(f),
      ]);
      addText(f, 1);
    });
  }
  for (const x of extra) {
    if (searchTexts.has(normalise(x.form))) continue;
    db.run("INSERT INTO form VALUES (?,?,?,?,?,?)", [
      e.id,
      x.kind,
      null,
      null,
      x.form,
      normalise(x.form),
    ]);
    addText(x.form, 1);
  }
  e.glosses.forEach((g, i) => {
    db.run("INSERT INTO sense VALUES (?,?,?,?)", [e.id, i, g.text, g.note ?? null]);
    for (const w of g.text.split(/[,;/]/)) addText(w, 2);
  });
  for (const [i, ex] of (e.examples ?? []).entries()) {
    db.run("INSERT INTO example VALUES (?,?,?,?)", [e.id, i, ex.text, ex.translation]);
  }
  for (const [norm, kind] of searchTexts)
    db.run("INSERT INTO search(lemma_id, norm, kind) VALUES (?, ?, ?)", [e.id, norm, kind]);
}

export function buildPack(
  db: SqliteLike,
  entries: Iterable<DictionaryEntry>,
  meta: Record<string, string>,
  extraForms: Map<string, ExtraForm[]> = new Map(),
): number {
  createPackSchema(db, meta);
  let n = 0;
  db.exec("BEGIN");
  for (const e of entries) {
    insertEntry(db, e, extraForms.get(e.lemma) ?? []);
    n++;
  }
  db.exec("COMMIT");
  return n;
}
