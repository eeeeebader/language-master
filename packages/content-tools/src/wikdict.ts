import type { DictionaryEntry, Gender, PartOfSpeech } from "@lm/schema";
import type { SqliteLike } from "./sqlite";

/**
 * WikDict (https://www.wikdict.com, CC BY-SA 4.0) merges translation data from several
 * Wiktionaries. Its es-de SQLite has `translation(lexentry, sense, written_rep, trans_list, score,
 * is_good, importance)`; the lexentry name carries the Spanish part of speech
 * ("spa/perro__sustantivo_masculino__1").
 */
interface Row {
  lexentry: string | null;
  written_rep: string;
  trans_list: string;
  score: number;
  is_good: number;
  importance: number | null;
}

export function wikdictPos(lexentry: string | null): { pos: PartOfSpeech; gender?: Gender } | null {
  if (!lexentry) return { pos: "other" };
  const m = lexentry.match(/__([a-z_áéíóúñ]+)__\d+$/i);
  const tag = m?.[1] ?? "";
  if (tag.startsWith("sustantivo")) {
    const gender: Gender | undefined = tag.includes("masculino_y_femenino")
      ? "mf"
      : tag.includes("masculino")
        ? "m"
        : tag.includes("femenino")
          ? "f"
          : undefined;
    return { pos: "noun", gender };
  }
  if (tag.startsWith("verbo")) return { pos: "verb" };
  if (tag.startsWith("adjetivo_cardinal") || tag.startsWith("numeral")) return { pos: "num" };
  if (tag.startsWith("adjetivo")) return { pos: "adj" };
  if (tag.startsWith("adverbio")) return { pos: "adv" };
  if (tag.startsWith("pronombre")) return { pos: "pron" };
  if (tag.startsWith("preposición") || tag.startsWith("preposicion")) return { pos: "prep" };
  if (tag.startsWith("conjunción") || tag.startsWith("conjuncion")) return { pos: "conj" };
  if (tag.startsWith("interjección") || tag.startsWith("interjeccion")) return { pos: "intj" };
  if (tag.startsWith("artículo") || tag.startsWith("articulo") || tag.startsWith("determinante"))
    return { pos: "det" };
  if (tag.startsWith("locución") || tag.startsWith("locucion") || tag.startsWith("frase"))
    return { pos: "phrase" };
  if (tag.startsWith("sufijo") || tag.startsWith("prefijo") || tag.startsWith("símbolo"))
    return null;
  return { pos: "other" };
}

export interface WikdictEntry {
  entry: DictionaryEntry;
  importance: number;
  score: number;
}

/** Read all Spanish lemmas with German translations, one entry per (lemma, pos). */
export function readWikdict(db: SqliteLike): WikdictEntry[] {
  const rows = db.all<Row>(
    "SELECT lexentry, written_rep, trans_list, score, is_good, importance FROM translation ORDER BY written_rep, score DESC",
  );
  const byKey = new Map<
    string,
    { entry: DictionaryEntry; importance: number; score: number; seen: Set<string> }
  >();
  for (const r of rows) {
    const word = r.written_rep.trim();
    if (!word || word.startsWith("-") || word.length > 40) continue;
    if (/^[A-ZÁÉÍÓÚÑ]/.test(word) && !/\s/.test(word)) continue; // proper names
    const p = wikdictPos(r.lexentry);
    if (!p) continue;
    const key = `${word}\u0000${p.pos}`;
    let cur = byKey.get(key);
    if (!cur) {
      cur = {
        entry: {
          id: `es:${word}`,
          language: "es",
          lemma: word,
          pos: p.pos,
          gender: p.gender,
          article:
            p.gender === "m"
              ? "el"
              : p.gender === "f"
                ? "la"
                : p.gender === "mf"
                  ? "el/la"
                  : undefined,
          glosses: [],
          examples: [],
          tags: [],
        },
        importance: r.importance ?? 0,
        score: r.score,
        seen: new Set(),
      };
      byKey.set(key, cur);
    }
    cur.importance = Math.max(cur.importance, r.importance ?? 0);
    for (const t of r.trans_list.split("|")) {
      const g = t.trim();
      if (!g || cur.seen.has(g.toLowerCase()) || cur.entry.glosses.length >= 4) continue;
      cur.seen.add(g.toLowerCase());
      cur.entry.glosses.push({ text: g });
    }
  }
  // Drop "other" rows when the same word exists with a known part of speech.
  const words = new Set(
    [...byKey.values()].filter((v) => v.entry.pos !== "other").map((v) => v.entry.lemma),
  );
  return [...byKey.values()]
    .filter(
      (v) => v.entry.glosses.length > 0 && !(v.entry.pos === "other" && words.has(v.entry.lemma)),
    )
    .map(({ entry, importance, score }) => ({ entry, importance, score }));
}

/** hermitdave/FrequencyWords es_50k.txt: "word count" per line, most frequent first. */
export function parseFrequencyList(text: string): Map<string, number> {
  const ranks = new Map<string, number>();
  let rank = 0;
  for (const line of text.split("\n")) {
    const word = line.trim().split(/\s+/)[0];
    if (!word) continue;
    rank++;
    if (!ranks.has(word)) ranks.set(word, rank);
  }
  return ranks;
}
