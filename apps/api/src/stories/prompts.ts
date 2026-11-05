import type { StoryRequest } from "@lm/schema";

export const PROMPT_VERSION = 1;

const THEME_TEXT: Record<StoryRequest["theme"], string> = {
  coming_of_age: "a coming-of-age moment in a young person's everyday life",
  daily_shopping: "shopping at a market or a shop",
  daily_working: "a day at work",
  daily_transport: "a trip on public transport",
  daily_friends: "a conversation between friends",
  diary: "a diary entry",
  fiction: "a short piece of light fiction",
  detective: "a small, friendly detective puzzle",
  romance: "a gentle, innocent romance",
  cooking: "cooking a simple dish together",
  hobbies: "hobbies and free-time activities",
  surprise: "any everyday situation of your choice",
};

export const WORDS_BY_LENGTH: Record<1 | 2 | 3, number> = { 1: 350, 2: 750, 3: 1200 };
export const FAILED_COUNT: Record<StoryRequest["failedWords"], number> = {
  off: 0,
  few: 3,
  some: 6,
  many: 10,
};

export interface WriterInputs {
  request: StoryRequest;
  knownLemmas: string[];
  failedLemmas: string[];
  languageName: string;
  feedback?: string;
}

/** The writer is pinned to A1/A2 and receives only enums and lemma lists, never learner free text. */
export function writerSystemPrompt(): string {
  return [
    "You write short, coherent, fun stories for adult beginners (CEFR A1 to A2) learning a language.",
    "Rules:",
    "- Use simple, clear sentences. Level 1: very short main clauses. Level 2: some subordinate clauses. Level 3: richer clauses and a little idiomatic phrasing.",
    "- Use the learner's known words preferentially. Introduce roughly the requested number of unseen words and let each new word recur where it fits naturally.",
    "- Weave the listed struggling words in if they fit; leave one out rather than bend the story.",
    "- Lean on the requested grammar focus.",
    "- No violence, no sexual content, no real persons, no brand names, no politics.",
    "- Basic filler words are fine wherever natural. A coherent story matters more than exact word counts.",
    '- Output JSON only: {"title": string, "paragraphs": string[]} where each paragraph is plain prose in the target language.',
  ].join("\n");
}

export function writerUserPrompt(i: WriterInputs): string {
  const r = i.request;
  const targetWords = WORDS_BY_LENGTH[r.length];
  const newWords = Math.round(targetWords * r.novelty * 0.6);
  return [
    `Language: ${i.languageName}. Theme: ${THEME_TEXT[r.theme]}. Comprehensibility level: ${r.level}. Length: about ${targetWords} words.`,
    `Grammar focus: ${r.grammarFocus}.`,
    `Target: about ${newWords} words the learner has not seen (roughly ${Math.round((1 - r.novelty) * 100)} % coverage by known words).`,
    `Struggling words to weave in (preferred, not forced): ${i.failedLemmas.length ? i.failedLemmas.join(", ") : "none"}.`,
    `Known words (use preferentially): ${i.knownLemmas.join(", ")}`,
    i.feedback ? `Revision feedback from the previous attempt: ${i.feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function notesSystemPrompt(nativeName: string): string {
  return [
    `You are a grammar tutor. You receive a tokenised ${nativeName === "German" ? "Spanish" : "target-language"} story (tokens with lemma and part of speech, indexed per sentence).`,
    `Write for a beginner whose native language is ${nativeName}; all explanations are in ${nativeName}.`,
    "Produce: a translation per sentence, a short contextual gloss for each content word that a beginner might not know, and grammar highlights.",
    "Highlights reference exact token index ranges [from, to) inside one sentence and use one of five colours:",
    "sage = verb forms, rose = noun phrases and agreement, lavender = pronouns and references, amber = tense and aspect markers, sky = connectors.",
    "When a highlight explains a reference to another sentence (a pronoun pointing back to a subject), set refSentenceId and refFrom/refTo.",
    "Keep notes to one or two plain sentences. Prefer 8 to 15 highlights per story, focused on the requested grammar focus.",
  ].join("\n");
}
