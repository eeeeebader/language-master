import type { SqliteLike } from "./sqlite";

/**
 * Audio pack: one SQLite file with pre-rendered clips keyed by the exact text they voice.
 * The client extracts rows into its own store, so the file is a transport container only.
 */
export const AUDIO_PACK_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audio (key TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL, ms INTEGER);
`;

/** Clip key: the voiced text, trimmed, with collapsed whitespace (not accent-stripped). */
export function audioKey(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function createAudioPackSchema(db: SqliteLike, meta: Record<string, string>) {
  db.exec(AUDIO_PACK_SCHEMA);
  for (const [k, v] of Object.entries(meta))
    db.run("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [k, v]);
}

export function insertClip(
  db: SqliteLike,
  text: string,
  mime: string,
  bytes: Uint8Array,
  ms?: number,
) {
  db.run("INSERT OR REPLACE INTO audio(key, mime, bytes, ms) VALUES (?, ?, ?, ?)", [
    audioKey(text),
    mime,
    bytes,
    ms ?? null,
  ]);
}

/**
 * Texts worth voicing for a dictionary pack: headwords, plurals and feminine forms.
 * With `top`, only lemmas ranked within the most frequent `top` (the core pack).
 */
export function packAudioTexts(db: SqliteLike, top?: number): string[] {
  const out = new Set<string>();
  const scope = top
    ? `WHERE frequency_rank IS NOT NULL ORDER BY frequency_rank LIMIT ${Math.floor(top)}`
    : "";
  for (const r of db.all<{ lemma: string; plural: string | null; gender_pair: string | null }>(
    `SELECT lemma, plural, gender_pair FROM lemma ${scope}`,
  )) {
    out.add(r.lemma);
    if (r.plural) out.add(r.plural.replace(/^(los|las|los\/las)\s+/, ""));
    if (r.gender_pair) {
      const pair = JSON.parse(r.gender_pair) as [string, string];
      out.add(pair[1]);
    }
  }
  return [...out];
}
