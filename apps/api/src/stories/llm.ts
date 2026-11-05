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
  provider: "anthropic" | "openai";
  writeModel: string;
  notesModel: string;
  anthropicKey?: string;
  openaiKey?: string;
}

/** Vercel AI SDK with a provider switch; the admin changes provider and models in app_settings. */
export function createLlm(cfg: LlmConfig): Llm {
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
