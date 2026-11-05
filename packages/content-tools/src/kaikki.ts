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

// ---------- German Wiktionary extract (kaikki.org/dewiktionary/Spanisch) ----------

/**
 * One line of the German Wiktionary's Spanish entries. Glosses are German sense descriptions;
 * `translations` (lang_code "de") carry short German equivalents. Morphology is thin, so the
 * English Wiktionary extract supplies forms, gender and conjugations for the same lemma.
 */
export interface DeWiktionaryLine {
  word: string;
  pos: string;
  lang_code: string;
  senses?: {
    glosses?: string[];
    tags?: string[];
    examples?: { text: string; translation?: string }[];
  }[];
  forms?: { form: string; tags?: string[] }[];
  sounds?: { ipa?: string }[];
  translations?: { lang_code?: string; word?: string }[];
  tags?: string[];
}

const DE_ARTICLE = /^(der|die|das|ein|eine)\s+/i;

/** Short German glosses: translations first, else the last clause of each sense description. */
export function deGlosses(line: DeWiktionaryLine): { text: string; note?: string }[] {
  const out: { text: string; note?: string }[] = [];
  const seen = new Set<string>();
  const push = (text: string, note?: string) => {
    const t = text.trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(note ? { text: t, note } : { text: t });
  };
  for (const tr of line.translations ?? []) {
    if (tr.lang_code === "de" && tr.word) push(tr.word);
    if (out.length >= 3) break;
  }
  if (out.length === 0) {
    for (const sense of line.senses ?? []) {
      for (const g of sense.glosses ?? []) {
        const clauses = g
          .split(/;|,/)
          .map((c) => c.trim())
          .filter(Boolean);
        const last = clauses[clauses.length - 1] ?? g;
        if (last.split(" ").length <= 3)
          push(last.replace(DE_ARTICLE, ""), clauses.length > 1 ? clauses[0] : undefined);
        else push(g.length > 60 ? `${g.slice(0, 57)}…` : g);
        if (out.length >= 3) break;
      }
      if (out.length >= 3) break;
    }
  }
  return out.slice(0, 4);
}

/**
 * German Wiktionary has one entry per inflected form ("3. Person Singular … des Verbs hablar",
 * "Plural des Substantivs casa"). Detect them so they become form rows of their lemma.
 */
const INFLECTED =
  /(?:des (?:Verbs|Substantivs|Adjektivs|Pronomens)|Form des|Partizip (?:Perfekt|Präsens)[\s\S]*?des Verbs)\s+([^\s,;.]+)/;

export interface InflectedForm {
  lemma: string;
  form: string;
  /** "conjugation" for verb forms, "plural" / "gender_pair" for nouns and adjectives, else "form" */
  kind: "conjugation" | "plural" | "gender_pair" | "form";
}

export function inflectedForm(line: DeWiktionaryLine): InflectedForm | null {
  for (const sense of line.senses ?? []) {
    for (const g of sense.glosses ?? []) {
      const m = g.match(INFLECTED);
      if (!m?.[1]) continue;
      const lemma = m[1];
      if (lemma === line.word) continue;
      const kind: InflectedForm["kind"] = /des Verbs/.test(g)
        ? "conjugation"
        : /Plural/.test(g)
          ? "plural"
          : /weiblich|Femininum|feminin/i.test(g)
            ? "gender_pair"
            : "form";
      return { lemma, form: line.word, kind };
    }
  }
  return null;
}

/** Map a German-Wiktionary line to an entry (glosses, IPA, examples). Morphology comes later. */
export function fromDeWiktionary(line: DeWiktionaryLine): DictionaryEntry | null {
  if (line.lang_code !== "es") return null;
  const pos = POS[line.pos];
  if (!pos) return null;
  if (inflectedForm(line)) return null;
  const glosses = deGlosses(line);
  if (glosses.length === 0) return null;
  const tags = line.tags ?? [];
  const gender: Gender | undefined =
    pos === "noun"
      ? tags.includes("masculine") && tags.includes("feminine")
        ? "mf"
        : tags.includes("masculine")
          ? "m"
          : tags.includes("feminine")
            ? "f"
            : undefined
      : undefined;
  const article =
    gender === "m" ? "el" : gender === "f" ? "la" : gender === "mf" ? "el/la" : undefined;
  const examples = (line.senses ?? [])
    .flatMap((s) => s.examples ?? [])
    .filter((e) => e.text && e.translation)
    .slice(0, 3)
    .map((e) => ({ text: e.text, translation: e.translation as string }));
  return {
    id: `es:${line.word}`,
    language: "es",
    lemma: line.word,
    pos,
    gender,
    article,
    ipa: line.sounds?.find((s) => s.ipa)?.ipa?.replace(/^[[/]|[\]/]$/g, ""),
    glosses,
    examples,
    tags: [],
  };
}

/** Fill gender, article, plural, gender pair, conjugations and IPA from the English extract. */
export function mergeMorphology(entry: DictionaryEntry, en: KaikkiLine): DictionaryEntry {
  const probe = fromKaikki(en, "de", { [en.word]: { glosses: [{ text: "x" }] } });
  if (!probe) return entry;
  return {
    ...entry,
    gender: entry.gender ?? probe.gender,
    article: entry.article ?? probe.article,
    plural: entry.plural ?? probe.plural,
    genderPair: entry.genderPair ?? probe.genderPair,
    conjugations: entry.conjugations ?? probe.conjugations,
    ipa: entry.ipa ?? probe.ipa,
  };
}

/** Hand-curated overrides win over both extracts; unknown lemmas are added as new entries. */
export function applyOverride(
  entry: DictionaryEntry,
  ov: Overrides[string] | undefined,
): DictionaryEntry {
  if (!ov) return entry;
  return { ...entry, ...ov, examples: ov.examples ?? entry.examples, tags: ov.tags ?? entry.tags };
}
