import type { StoryDocument, StoryRequest } from "@lm/schema";
import { normaliseAnswer } from "@lm/srs";

export interface CoverageCheck {
  coverage: number;
  target: number;
  deviation: number;
  usedFailed: string[];
  ok: boolean;
  feedback: string | null;
}

/** Only hard failures retry: coverage more than ~5 points off, or none of the failed words used when some were requested. */
export function checkStory(
  doc: StoryDocument,
  request: StoryRequest,
  knownLemmas: readonly string[],
  failedLemmas: readonly string[],
  tolerance = 0.05,
): CoverageCheck {
  const known = new Set(knownLemmas.map(normaliseAnswer));
  const failedSet = new Set(failedLemmas.map(normaliseAnswer));
  let total = 0;
  let covered = 0;
  const usedFailed = new Set<string>();
  for (const p of doc.paragraphs)
    for (const s of p)
      for (const t of s.tokens) {
        if (!t.isWord || t.pos === "other") continue;
        total++;
        const l = normaliseAnswer(t.lemma);
        if (known.has(l) || /^[A-ZÁÉÍÓÚÑ]/.test(t.lemma)) covered++;
        if (failedSet.has(l)) usedFailed.add(t.lemma);
      }
  const coverage = total ? covered / total : 1;
  const target = 1 - request.novelty;
  const deviation = coverage - target;
  const problems: string[] = [];
  if (Math.abs(deviation) > tolerance) {
    problems.push(
      deviation > 0
        ? `The story uses too few new words (coverage ${pct(coverage)} vs target ${pct(target)}); add more unseen words.`
        : `The story uses too many unknown words (coverage ${pct(coverage)} vs target ${pct(target)}); stick closer to the known words.`,
    );
  }
  if (failedLemmas.length > 0 && usedFailed.size === 0) {
    problems.push(
      `None of the struggling words were used; include at least one of: ${failedLemmas.slice(0, 5).join(", ")}.`,
    );
  }
  return {
    coverage,
    target,
    deviation,
    usedFailed: [...usedFailed],
    ok: problems.length === 0,
    feedback: problems.length ? problems.join(" ") : null,
  };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Highlight spans must point at real token ranges; a bad span is dropped rather than failing the story. */
export function pruneSpans(doc: StoryDocument): StoryDocument {
  const sentences = new Map(doc.paragraphs.flat().map((s) => [s.id, s]));
  const spans = doc.spans.filter((sp) => {
    const s = sentences.get(sp.sentenceId);
    if (!s || sp.from < 0 || sp.to > s.tokens.length || sp.from >= sp.to) return false;
    if (sp.refSentenceId) {
      const r = sentences.get(sp.refSentenceId);
      if (!r) return false;
      if (
        sp.refFrom !== undefined &&
        sp.refTo !== undefined &&
        (sp.refFrom < 0 || sp.refTo > r.tokens.length || sp.refFrom >= sp.refTo)
      )
        return false;
    }
    return true;
  });
  return { ...doc, spans };
}
