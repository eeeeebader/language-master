import type { CardState, StoryDocument, UserWord } from "@lm/schema";
import { isMastered, normaliseAnswer } from "@lm/srs";

export interface Coverage {
  known: number;
  learning: number;
  struggling: number;
  new: number;
  total: number;
  /** distinct lemmas per bucket */
  lemmas: { known: string[]; learning: string[]; struggling: string[]; new: string[] };
}

export function storyLemmas(doc: StoryDocument): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of doc.paragraphs)
    for (const s of p)
      for (const t of s.tokens)
        if (t.isWord && t.pos !== "other") counts.set(t.lemma, (counts.get(t.lemma) ?? 0) + 1);
  return counts;
}

/** Four-part coverage of a text against the learner's words, computed locally. */
export function computeCoverage(
  doc: StoryDocument,
  words: UserWord[],
  states: CardState[],
): Coverage {
  const wordByLemma = new Map(
    words.filter((w) => !w.deletedAt).map((w) => [normaliseAnswer(w.lemma), w]),
  );
  const statesByWord = new Map<string, CardState[]>();
  for (const s of states) statesByWord.set(s.wordId, [...(statesByWord.get(s.wordId) ?? []), s]);

  const counts = storyLemmas(doc);
  const c: Coverage = {
    known: 0,
    learning: 0,
    struggling: 0,
    new: 0,
    total: 0,
    lemmas: { known: [], learning: [], struggling: [], new: [] },
  };
  for (const [lemma, n] of counts) {
    // Proper nouns (capitalised, not in dictionary) are counted as known.
    const w = wordByLemma.get(normaliseAnswer(lemma));
    let bucket: keyof Coverage["lemmas"];
    if (/^[A-ZÁÉÍÓÚÑ]/.test(lemma)) bucket = "known";
    else if (!w) bucket = "new";
    else {
      const st = statesByWord.get(w.id) ?? [];
      if (st.some(isMastered)) bucket = "known";
      else if (st.some((s) => s.lapses >= 2 || s.state === 3)) bucket = "struggling";
      else if (st.length > 0) bucket = "learning";
      else bucket = "learning";
    }
    c[bucket] += n;
    c.total += n;
    c.lemmas[bucket].push(lemma);
  }
  return c;
}
