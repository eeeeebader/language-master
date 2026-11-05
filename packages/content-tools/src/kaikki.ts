import type { DictionaryEntry, Gender, PartOfSpeech } from "@lm/schema";

/**
 * Kaikki Wiktionary extract (https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl):
 * one JSON object per line. The fields we use:
 *   word, pos, lang_code, senses[].glosses[], senses[].tags[], forms[]{form,tags[]},
 *   sounds[]{ipa}, translations[]{lang_code, word, sense}, head_templates[].args (gender)
 */
export interface KaikkiLine {
  word: string;
  pos: string;
  lang_code: string;
  senses?: {
    glosses?: string[];
    raw_glosses?: string[];
    tags?: string[];
    examples?: { text: string; english?: string; translation?: string }[];
  }[];
  forms?: { form: string; tags?: string[] }[];
  sounds?: { ipa?: string }[];
  translations?: { lang_code?: string; word?: string; sense?: string }[];
  head_templates?: { args?: Record<string, string> }[];
  tags?: string[];
}

const POS: Record<string, PartOfSpeech> = {
  noun: "noun",
  verb: "verb",
  adj: "adj",
  adv: "adv",
  pron: "pron",
  det: "det",
  article: "det",
  prep: "prep",
  conj: "conj",
  num: "num",
  intj: "intj",
  phrase: "phrase",
  proverb: "phrase",
};

/** Overrides keyed by lemma: hand-curated A1/A2 glosses win over Wiktionary. */
export type Overrides = Record<string, Partial<Omit<DictionaryEntry, "id" | "language" | "lemma">>>;

const PERSON_TAGS = [
  ["first-person", "singular"],
  ["second-person", "singular"],
  ["third-person", "singular"],
  ["first-person", "plural"],
  ["second-person", "plural"],
  ["third-person", "plural"],
];
const TENSES: Record<string, string[]> = {
  Präsens: ["present", "indicative"],
  "Pretérito indefinido": ["preterite", "indicative"],
  "Pretérito perfecto": ["present", "perfect"],
  Futuro: ["future", "indicative"],
};

const hasAll = (tags: string[] | undefined, want: string[]) => want.every((w) => tags?.includes(w));

function germanGlosses(line: KaikkiLine): { text: string; note?: string }[] {
  const t = (line.translations ?? []).filter((x) => x.lang_code === "de" && x.word);
  const seen = new Set<string>();
  const out: { text: string; note?: string }[] = [];
  for (const x of t) {
    const w = (x.word as string).trim();
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(x.sense ? { text: w, note: x.sense } : { text: w });
    if (out.length === 4) break;
  }
  return out;
}

/** Map one Kaikki line to a DictionaryEntry; returns null when there is no German gloss. */
export function fromKaikki(
  line: KaikkiLine,
  native: "de",
  overrides: Overrides = {},
): DictionaryEntry | null {
  if (line.lang_code !== "es") return null;
  const pos = POS[line.pos];
  if (!pos) return null;
  const ov = overrides[line.word] ?? {};
  const glosses = ov.glosses ?? germanGlosses(line);
  if (glosses.length === 0) return null;

  const args = line.head_templates?.[0]?.args ?? {};
  const g = (args.g ?? args["1"] ?? "").toLowerCase();
  const gender: Gender | undefined =
    pos === "noun"
      ? g.startsWith("m") && g.includes("f")
        ? "mf"
        : g.startsWith("m")
          ? "m"
          : g.startsWith("f")
            ? "f"
            : undefined
      : undefined;
  const article =
    gender === "m" ? "el" : gender === "f" ? "la" : gender === "mf" ? "el/la" : undefined;

  const forms = line.forms ?? [];
  const plural = forms.find(
    (f) => hasAll(f.tags, ["plural"]) && !f.tags?.includes("feminine"),
  )?.form;
  const feminine = forms.find(
    (f) =>
      hasAll(f.tags, ["feminine", "singular"]) ||
      (f.tags?.includes("feminine") && !f.tags?.includes("plural")),
  )?.form;
  const genderPair =
    pos === "adj" && feminine && feminine !== line.word
      ? ([line.word, feminine] as [string, string])
      : undefined;

  let conjugations: Record<string, string[]> | undefined;
  if (pos === "verb") {
    conjugations = {};
    for (const [label, tags] of Object.entries(TENSES)) {
      const six = PERSON_TAGS.map((p) => forms.find((f) => hasAll(f.tags, [...tags, ...p]))?.form);
      if (six.every((x): x is string => !!x)) conjugations[label] = six;
    }
    if (Object.keys(conjugations).length === 0) conjugations = undefined;
  }

  const examples = (line.senses ?? [])
    .flatMap((s) => s.examples ?? [])
    .filter((e) => e.text && (e.translation || e.english))
    .slice(0, 3)
    .map((e) => ({ text: e.text, translation: (e.translation ?? e.english) as string }));

  const entry: DictionaryEntry = {
    id: `es:${line.word}`,
    language: "es",
    lemma: line.word,
    pos,
    gender,
    article: article ? `${article}` : undefined,
    plural:
      plural && article
        ? `${article === "el" ? "los" : article === "la" ? "las" : "los/las"} ${plural}`
        : plural,
    genderPair,
    ipa: line.sounds?.find((s) => s.ipa)?.ipa?.replace(/^\/|\/$/g, ""),
    glosses,
    examples,
    conjugations,
    tags: [],
    ...ov,
  };
  void native;
  return entry;
}
