import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";

export interface Usage {
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export const WriterOutput = z.object({
  title: z.string().min(1).max(120),
  paragraphs: z.array(z.string().min(1)).min(1).max(12),
});
export type WriterOutput = z.infer<typeof WriterOutput>;

export const NotesOutput = z.object({
  translations: z.array(z.object({ sentenceId: z.string(), translation: z.string() })),
  glosses: z.array(
    z.object({ sentenceId: z.string(), index: z.number().int().nonnegative(), gloss: z.string() }),
  ),
  spans: z.array(
    z.object({
      sentenceId: z.string(),
      from: z.number().int().nonnegative(),
      to: z.number().int().positive(),
      colour: z.enum(["sage", "rose", "lavender", "amber", "sky"]),
      title: z.string(),
      note: z.string(),
      refSentenceId: z.string().optional(),
      refFrom: z.number().int().nonnegative().optional(),
      refTo: z.number().int().positive().optional(),
    }),
  ),
});
export type NotesOutput = z.infer<typeof NotesOutput>;

export interface Llm {
  write(system: string, prompt: string): Promise<{ output: WriterOutput; usage: Usage }>;
  notes(system: string, prompt: string): Promise<{ output: NotesOutput; usage: Usage }>;
  /** Cheap classifier pass; true when the text is safe. */
  moderate(text: string): Promise<{ safe: boolean; usage: Usage }>;
}

export interface LlmConfig {
  /** "fake" is a deterministic, cost-free provider for local development and CI. */
  provider: "anthropic" | "openai" | "fake";
  writeModel: string;
  notesModel: string;
  anthropicKey?: string;
  openaiKey?: string;
}

/** Vercel AI SDK with a provider switch; the admin changes provider and models in app_settings. */
export function createLlm(cfg: LlmConfig): Llm {
  if (cfg.provider === "fake") return createFakeLlm();
  const model = (id: string) =>
    cfg.provider === "openai"
      ? createOpenAI({ apiKey: cfg.openaiKey })(id)
      : createAnthropic({ apiKey: cfg.anthropicKey })(id);
  const usage = (
    m: string,
    u: { inputTokens?: number; outputTokens?: number } | undefined,
  ): Usage => ({ model: m, tokensIn: u?.inputTokens ?? 0, tokensOut: u?.outputTokens ?? 0 });

  return {
    async write(system, prompt) {
      const r = await generateObject({
        model: model(cfg.writeModel),
        schema: WriterOutput,
        system,
        prompt,
        temperature: 0.8,
      });
      return { output: r.object, usage: usage(cfg.writeModel, r.usage) };
    },
    async notes(system, prompt) {
      const r = await generateObject({
        model: model(cfg.notesModel),
        schema: NotesOutput,
        system,
        prompt,
        temperature: 0.2,
      });
      return { output: r.object, usage: usage(cfg.notesModel, r.usage) };
    },
    async moderate(text) {
      const r = await generateText({
        model: model(cfg.notesModel),
        system:
          "Answer with exactly SAFE or UNSAFE. UNSAFE means the text contains violence, sexual content, hate, self-harm, or real named persons.",
        prompt: text.slice(0, 6000),
        temperature: 0,
      });
      return {
        safe: r.text.trim().toUpperCase().startsWith("SAFE"),
        usage: usage(cfg.notesModel, r.usage),
      };
    },
  };
}

/** Rough € cost per 1k tokens for the llm_usage table; verify against current price lists. */
export function estimateCostCents(model: string, tokensIn: number, tokensOut: number): number {
  const small = /haiku|mini|flash/i.test(model);
  const inRate = small ? 0.0001 : 0.003; // € per token (approx.)
  const outRate = small ? 0.0005 : 0.015;
  return Math.round((tokensIn * inRate + tokensOut * outRate) * 100 * 100) / 100 / 1000;
}

/**
 * Deterministic stand-in for the two LLM calls. The writer builds a short A1 text from the known
 * and failed lemmas listed in the prompt; the notes pass translates by sentence id and marks the
 * first verb-tagged token of each sentence. Enough to exercise the whole pipeline without a key.
 */
export function createFakeLlm(): Llm {
  const usage = (tokensIn: number, tokensOut: number): Usage => ({
    model: "fake",
    tokensIn,
    tokensOut,
  });
  const pick = (prompt: string, label: string): string[] => {
    const m = prompt.match(new RegExp(`${label}[^\n]*:s*([^\n]+)`, "i"));
    return m?.[1]
      ? m[1]
          .split(/[,\s]+/)
          .map((w) => w.trim())
          .filter((w) => /^[a-záéíóúñü]+$/i.test(w))
      : [];
  };
  return {
    async write(_system, prompt) {
      const known = pick(prompt, "known");
      const failed = pick(prompt, "struggl|failed");
      const words = [...failed, ...known].slice(0, 12);
      const w = (i: number) => words[i % Math.max(1, words.length)] ?? "casa";
      const paragraphs = [
        `Hoy Ana va al mercado. Compra ${w(0)} y ${w(1)}. El ${w(2)} es grande y bonito.`,
        `Ana habla con el vendedor. Quiere ${w(3)} y ${w(4)}, por favor. Paga tres euros.`,
        `Después Ana vuelve a casa. El perro duerme en el sofá. Ana está contenta.`,
      ];
      return { output: { title: "Un día en el mercado", paragraphs }, usage: usage(300, 120) };
    },
    async notes(_system, prompt) {
      const translations: NotesOutput["translations"] = [];
      const glosses: NotesOutput["glosses"] = [];
      const spans: NotesOutput["spans"] = [];
      for (const line of prompt.split("\n")) {
        const m = line.match(/^(s\d+): (.+)$/);
        if (!m?.[1] || !m[2]) continue;
        const id = m[1];
        const tokens = m[2].split(" ").map((t) => {
          const mm = t.match(/^(\d+):(.+)\((.+)\/(.+)\)$/);
          return mm ? { i: Number(mm[1]), text: mm[2], lemma: mm[3], pos: mm[4] } : null;
        });
        const words = tokens.filter((t): t is NonNullable<typeof t> => !!t);
        translations.push({
          sentenceId: id,
          translation: `(DE) ${words.map((t) => t?.text).join(" ")}`,
        });
        const verb = words.find((t) => t.pos === "verb");
        if (verb) {
          glosses.push({ sentenceId: id, index: verb.i, gloss: `${verb.lemma} (Verb)` });
          spans.push({
            sentenceId: id,
            from: verb.i,
            to: verb.i + 1,
            colour: "sage",
            title: `${verb.lemma} – Präsens`,
            note: `${verb.text} ist eine Form von ${verb.lemma}.`,
          });
        }
      }
      return { output: { translations, glosses, spans }, usage: usage(400, 150) };
    },
    async moderate() {
      return { safe: true, usage: usage(10, 1) };
    },
  };
}
