import type { DictionaryEntry, Gender, PartOfSpeech } from "@lm/schema";
import { normalise } from "./pack";
import type { SqliteLike } from "./sqlite";

export type { SqliteLike } from "./sqlite";

interface LemmaRow {
  id: string;
  lemma: string;
  pos: string;
  gender: string | null;
  article: string | null;
  plural: string | null;
  gender_pair: string | null;
  ipa: string | null;
  frequency_rank: number | null;
  tags: string;
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    prev = cur;
  }
  return prev[n] as number;
}

/** Query layer over a dictionary pack. Works with any SqliteLike binding. */
export class DictClient {
  constructor(private readonly db: SqliteLike) {}

  meta(): Record<string, string> {
    return Object.fromEntries(
      this.db
        .all<{ key: string; value: string }>("SELECT key, value FROM meta")
        .map((r) => [r.key, r.value]),
    );
  }

  getEntry(id: string): DictionaryEntry | undefined {
    const row = this.db.all<LemmaRow>("SELECT * FROM lemma WHERE id = ?", [id])[0];
    return row ? this.hydrate(row) : undefined;
  }

  getByLemma(lemma: string): DictionaryEntry | undefined {
    const row = this.db.all<LemmaRow>("SELECT * FROM lemma WHERE norm = ? LIMIT 1", [
      normalise(lemma),
    ])[0];
    return row ? this.hydrate(row) : undefined;
  }

  /** Prefix match via FTS5, then fuzzy (edit distance ≤ 1) on lemma/forms, accent-insensitive. */
  search(query: string, limit = 30): DictionaryEntry[] {
    const q = normalise(query);
    if (!q)
      return this.db
        .all<LemmaRow>(
          "SELECT * FROM lemma ORDER BY frequency_rank IS NULL, frequency_rank LIMIT ?",
          [limit],
        )
        .map((r) => this.hydrate(r));
    const ftsTerm = `"${q.replace(/"/g, "")}"*`;
    const ids = new Map<string, number>();
    for (const r of this.db.all<{ lemma_id: string; rank: number }>(
      "SELECT lemma_id, rank FROM search WHERE search MATCH ? ORDER BY rank LIMIT ?",
      [ftsTerm, limit * 2],
    )) {
      ids.set(r.lemma_id, Math.min(ids.get(r.lemma_id) ?? 0, -(100 + (r.rank ?? 0))));
    }
    for (const r of this.db.all<{ lemma_id: string }>("SELECT lemma_id FROM form WHERE norm = ?", [
      q,
    ]))
      ids.set(r.lemma_id, Math.min(ids.get(r.lemma_id) ?? 0, -90));
    if (ids.size < limit && q.length >= 3) {
      const lo = q.slice(0, 1);
      for (const r of this.db.all<{ id: string; norm: string }>(
        "SELECT id, norm FROM lemma WHERE norm >= ? AND norm < ? AND length(norm) BETWEEN ? AND ?",
        [lo, `${lo}￿`, q.length - 1, q.length + 1],
      )) {
        if (!ids.has(r.id) && editDistance(q, r.norm) <= 1) ids.set(r.id, -40);
      }
    }
    const ordered = [...ids.entries()].sort((a, b) => a[1] - b[1]).slice(0, limit);
    return ordered.map(([id]) => this.getEntry(id)).filter((e): e is DictionaryEntry => !!e);
  }

  private hydrate(row: LemmaRow): DictionaryEntry {
    const senses = this.db.all<{ gloss: string; note: string | null }>(
      "SELECT gloss, note FROM sense WHERE lemma_id = ? ORDER BY position",
      [row.id],
    );
    const examples = this.db.all<{ text: string; translation: string }>(
      "SELECT text, translation FROM example WHERE lemma_id = ? ORDER BY position",
      [row.id],
    );
    const conj = this.db.all<{ tense: string; person: number; form: string }>(
      "SELECT tense, person, form FROM form WHERE lemma_id = ? AND kind = 'conjugation' ORDER BY tense, person",
      [row.id],
    );
    const conjugations: Record<string, string[]> = {};
    for (const c of conj) {
      const forms = conjugations[c.tense] ?? [];
      forms[c.person] = c.form;
      conjugations[c.tense] = forms;
    }
    return {
      id: row.id,
      language: "es",
      lemma: row.lemma,
      pos: row.pos as PartOfSpeech,
      gender: (row.gender as Gender | null) ?? undefined,
      article: row.article ?? undefined,
      plural: row.plural ?? undefined,
      genderPair: row.gender_pair ? (JSON.parse(row.gender_pair) as [string, string]) : undefined,
      ipa: row.ipa ?? undefined,
      glosses: senses.map((s) => ({ text: s.gloss, note: s.note ?? undefined })),
      examples,
      conjugations: Object.keys(conjugations).length ? conjugations : undefined,
      frequencyRank: row.frequency_rank ?? undefined,
      tags: JSON.parse(row.tags) as string[],
    };
  }
}
