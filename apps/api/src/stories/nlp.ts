import { z } from "zod";

/** Response shape of apps/nlp POST /annotate. */
export const Annotation = z.object({
  sentences: z.array(
    z.object({
      text: z.string(),
      tokens: z.array(
        z.object({
          text: z.string(),
          lemma: z.string(),
          pos: z.string(),
          ws: z.string(),
          isWord: z.boolean(),
        }),
      ),
    }),
  ),
});
export type Annotation = z.infer<typeof Annotation>;

export type Annotate = (paragraphs: string[], language: string) => Promise<Annotation[]>;

export function createAnnotator(baseUrl: string, fetchImpl: typeof fetch = fetch): Annotate {
  return async (paragraphs, language) => {
    const res = await fetchImpl(`${baseUrl}/annotate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language, paragraphs }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`nlp ${res.status}`);
    const json = (await res.json()) as { paragraphs: unknown[] };
    return json.paragraphs.map((p) => Annotation.parse(p));
  };
}

const POS_MAP: Record<string, string> = {
  NOUN: "noun",
  PROPN: "noun",
  VERB: "verb",
  AUX: "verb",
  ADJ: "adj",
  ADV: "adv",
  PRON: "pron",
  DET: "det",
  ADP: "prep",
  CCONJ: "conj",
  SCONJ: "conj",
  NUM: "num",
  INTJ: "intj",
  PUNCT: "other",
  SYM: "other",
  X: "other",
  PART: "other",
};

const ALREADY_MAPPED = new Set([
  "noun",
  "verb",
  "adj",
  "adv",
  "pron",
  "det",
  "prep",
  "conj",
  "num",
  "intj",
  "phrase",
  "other",
]);

export function mapPos(
  upos: string,
):
  | "noun"
  | "verb"
  | "adj"
  | "adv"
  | "pron"
  | "det"
  | "prep"
  | "conj"
  | "num"
  | "intj"
  | "phrase"
  | "other" {
  const mapped = POS_MAP[upos];
  if (mapped) return mapped as ReturnType<typeof mapPos>;
  // The NLP service already maps UPOS onto the schema enum; pass those through.
  return (ALREADY_MAPPED.has(upos) ? upos : "other") as ReturnType<typeof mapPos>;
}
