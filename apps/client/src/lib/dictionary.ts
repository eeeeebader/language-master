import type { DictionaryEntry, VariantKind } from "@lm/schema";
import { fuzzyMatch, normaliseAnswer } from "@lm/srs";
import { DICTIONARY_ES } from "@/data/dictionary-es";
import { dictClient, packSearchReady, searchPack } from "./dict-pack";

const byId = new Map(DICTIONARY_ES.map((e) => [e.id, e]));
const byLemma = new Map(DICTIONARY_ES.map((e) => [normaliseAnswer(e.lemma), e]));

/** Curated seed glosses go first; the pack's Wiktionary glosses follow (deduplicated). */
function withSeedGlosses(e: DictionaryEntry | undefined): DictionaryEntry | undefined {
  if (!e) return e;
  const seed = byLemma.get(normaliseAnswer(e.lemma));
  if (!seed || seed === e) return e;
  const seen = new Set(seed.glosses.map((g) => g.text.toLowerCase()));
  return {
    ...e,
    glosses: [...seed.glosses, ...e.glosses.filter((g) => !seen.has(g.text.toLowerCase()))].slice(
      0,
      4,
    ),
    examples: e.examples.length ? e.examples : seed.examples,
  };
}

export function getEntry(id: string): DictionaryEntry | undefined {
  return withSeedGlosses(dictClient()?.getEntry(id)) ?? byId.get(id);
}

export function getEntryByLemma(lemma: string): DictionaryEntry | undefined {
  return withSeedGlosses(dictClient()?.getByLemma(lemma)) ?? byLemma.get(normaliseAnswer(lemma));
}

/** Where entries come from right now: the downloaded pack or the bundled seed. */
export function dictionarySource(): "pack" | "seed" {
  return dictClient() ? "pack" : "seed";
}

/** Prefix + fuzzy (edit distance 1), accent-insensitive, over lemma, forms and German glosses. */
export function searchDictionary(query: string, limit = 30): DictionaryEntry[] {
  const pack = dictClient();
  if (pack) return pack.search(query, limit);
  return searchSeed(query, limit);
}

function searchSeed(query: string, limit: number): DictionaryEntry[] {
  const q = normaliseAnswer(query);
  if (!q)
    return DICTIONARY_ES.slice()
      .sort((a, b) => (a.frequencyRank ?? 9999) - (b.frequencyRank ?? 9999))
      .slice(0, limit);
  const scored: { e: DictionaryEntry; score: number }[] = [];
  for (const e of DICTIONARY_ES) {
    const lemma = normaliseAnswer(e.lemma);
    let score = 0;
    if (lemma === q) score = 100;
    else if (lemma.startsWith(q)) score = 80;
    else if (e.genderPair?.some((g) => normaliseAnswer(g).startsWith(q))) score = 75;
    else if (e.plural && normaliseAnswer(e.plural).includes(q)) score = 60;
    else if (
      e.conjugations &&
      Object.values(e.conjugations).some((forms) => forms.some((f) => normaliseAnswer(f) === q))
    )
      score = 70;
    else if (e.glosses.some((g) => normaliseAnswer(g.text) === q)) score = 55;
    else if (e.glosses.some((g) => normaliseAnswer(g.text).startsWith(q))) score = 50;
    else if (fuzzyMatch(q, e.lemma)) score = 40;
    else if (e.glosses.some((g) => fuzzyMatch(q, g.text))) score = 30;
    if (score > 0) scored.push({ e, score: score - (e.frequencyRank ?? 9999) / 100_000 });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}

export interface VariantOption {
  kind: VariantKind;
  front: string;
  back: string;
  label: string;
}

/** The card shapes a dictionary entry can be trained in. */
export function variantOptions(e: DictionaryEntry): VariantOption[] {
  const gloss = e.glosses
    .map((g) => g.text)
    .slice(0, 2)
    .join(", ");
  const out: VariantOption[] = [{ kind: "lemma", front: e.lemma, back: gloss, label: "Grundform" }];
  if (e.article && e.pos === "noun")
    out.push({
      kind: "article",
      front: `${e.article} ${e.lemma}`,
      back: gloss,
      label: "Mit Artikel",
    });
  if (e.plural)
    out.push({ kind: "plural", front: e.plural, back: `${gloss} (Plural)`, label: "Plural" });
  if (e.genderPair)
    out.push({
      kind: "gender_pair",
      front: `${e.genderPair[0]} / ${e.genderPair[1]}`,
      back: gloss,
      label: "Geschlechtspaar",
    });
  if (e.conjugations) {
    const persons = ["ich", "du", "er/sie", "wir", "ihr", "sie"];
    for (const [tense, forms] of Object.entries(e.conjugations)) {
      forms.forEach((f, i) => {
        out.push({
          kind: "conjugation",
          front: f,
          back: `${persons[i]} · ${gloss} (${tense})`,
          label: `${tense}: ${f}`,
        });
      });
    }
  }
  return out;
}

/** Non-blocking search: the pack is queried on a worker; the bundled seed answers synchronously. */
export async function searchDictionaryAsync(query: string, limit = 30): Promise<DictionaryEntry[]> {
  if (packSearchReady()) return searchPack(query, limit);
  return searchSeed(query, limit);
}
