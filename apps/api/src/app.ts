import type { Db } from "@lm/database";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createOfficialAnnotator } from "./admin/official";
import { requireUser } from "./auth";
import type { Env } from "./env";
import { GenerationLimiter } from "./lib/rateLimit";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { healthRoutes } from "./routes/health";
import { storyRoutes } from "./routes/stories";
import { syncRoutes } from "./routes/sync";
import { webhookRoutes } from "./routes/webhooks";
import { SettingsStore } from "./settings";
import { createLlm } from "./stories/llm";
import { createAnnotator } from "./stories/nlp";
import { createPipeline } from "./stories/pipeline";

export interface AppState {
  migrated: boolean;
  version: string;
}

export function createApp(db: Db, env: Env, state: AppState) {
  const app = new Hono();
  const settings = new SettingsStore(db);
  const limiter = new GenerationLimiter(() => 10);

  app.use(
    "*",
    logger((line) => console.log(line)),
  );
  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGINS.split(",").map((s) => s.trim()),
      allowHeaders: ["authorization", "content-type"],
      maxAge: 600,
    }),
  );

  app.route("/health", healthRoutes(db, state));
  app.route("/webhooks", webhookRoutes(db, env));

  const auth = requireUser(env.SUPABASE_JWT_SECRET);
  app.use("/sync/*", auth);
  app.use("/stories/*", auth);
  app.use("/account/*", auth);
  app.use("/account", auth);
  app.use("/admin/*", auth);

  app.route("/sync", syncRoutes(db));
  app.route("/account", accountRoutes(db, env));

  // LLM config is read lazily so admin changes apply without restart.
  const pipeline = async (input: Parameters<ReturnType<typeof createPipeline>>[0]) => {
    const s = await settings.all();
    const provider = (s["llm.provider"] as "anthropic" | "openai") ?? "anthropic";
    const llm = createLlm({
      provider,
      writeModel:
        provider === "openai" ? String(s["llm.model.openai"]) : String(s["llm.model.write"]),
      notesModel:
        provider === "openai" ? String(s["llm.model.openai"]) : String(s["llm.model.notes"]),
      anthropicKey: env.ANTHROPIC_API_KEY,
      openaiKey: env.OPENAI_API_KEY,
    });
    return createPipeline(llm, createAnnotator(env.NLP_URL))(input);
  };
  app.route("/stories", storyRoutes({ db, settings, limiter, pipeline }));

  const annotateOfficial: ReturnType<typeof createOfficialAnnotator> = async (input, now) => {
    const s = await settings.all();
    const provider = (s["llm.provider"] as "anthropic" | "openai") ?? "anthropic";
    const llm = createLlm({
      provider,
      writeModel:
        provider === "openai" ? String(s["llm.model.openai"]) : String(s["llm.model.write"]),
      notesModel:
        provider === "openai" ? String(s["llm.model.openai"]) : String(s["llm.model.notes"]),
      anthropicKey: env.ANTHROPIC_API_KEY,
      openaiKey: env.OPENAI_API_KEY,
    });
    return createOfficialAnnotator(llm, createAnnotator(env.NLP_URL))(input, now);
  };
  app.route("/admin", adminRoutes({ db, settings, annotateOfficial }));

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });
  return app;
}
