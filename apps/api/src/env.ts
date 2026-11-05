import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(16),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NLP_URL: z.string().default("http://localhost:8001"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PREMIUM: z.string().optional(),
  STRIPE_PRICE_TOKENS_10: z.string().optional(),
  STRIPE_PRICE_TOKENS_50: z.string().optional(),
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
  RUN_MIGRATIONS: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  RUN_CRON: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}
