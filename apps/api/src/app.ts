import type { Db } from "@lm/database";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createOfficialAnnotator } from "./admin/official";
import { requireUser } from "./auth";
import type { Env } from "./env";
import { recordRequest, routeLabel } from "./lib/ops";
import { GenerationLimiter } from "./lib/rateLimit";
import { captureException } from "./lib/sentry";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { billingRoutes } from "./routes/billing";
import { healthRoutes } from "./routes/health";
import { type Announcement, inboxRoutes } from "./routes/inbox";
import { consentRoutes, legalRoutes } from "./routes/legal";
import { opsRoutes, recordOpsEvent } from "./routes/ops";
import { packRoutes } from "./routes/packs";
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
  app.use("*", async (c, next) => {
    const t0 = performance.now();
    await next();
    recordRequest(c.req.method, routeLabel(c.req.path), c.res.status, performance.now() - t0);
  });
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
  app.route("/packs", packRoutes(db));
  app.route("/legal", legalRoutes(db));

  const auth = requireUser(env.SUPABASE_JWT_SECRET);
  app.use("/sync/*", auth);
  app.use("/stories/*", auth);
  app.use("/account/*", auth);
  app.use("/account", auth);
  app.use("/admin/*", auth);
  app.use("/billing/*", auth);
  app.use("/inbox", auth);
  app.use("/account/consents/*", auth);
  app.use("/account/consents", auth);

  app.route("/sync", syncRoutes(db));
  app.route("/account", accountRoutes(db, env));
  app.route("/account/consents", consentRoutes(db));
  app.route("/billing", billingRoutes(db, env, settings));
  app.route(
    "/inbox",
    inboxRoutes(db, async () => settings.get<Announcement[]>("announcements", [])),
  );

  // LLM config is read lazily so admin changes apply without restart.
  // LLM config: env overrides win, else admin app_settings; read lazily so admin changes apply.
  const llmConfig = async () => {
    const s = await settings.all();
    const provider =
      env.LLM_PROVIDER ?? ((s["llm.provider"] as "anthropic" | "openai" | "fake") || "anthropic");
    const openaiModel = env.LLM_MODEL_OPENAI ?? String(s["llm.model.openai"]);
    return createLlm({
      provider,
      writeModel:
        provider === "openai" ? openaiModel : (env.LLM_MODEL_WRITE ?? String(s["llm.model.write"])),
      notesModel:
        provider === "openai" ? openaiModel : (env.LLM_MODEL_NOTES ?? String(s["llm.model.notes"])),
      anthropicKey: env.ANTHROPIC_API_KEY,
      openaiKey: env.OPENAI_API_KEY,
    });
  };
  const pipeline = async (input: Parameters<ReturnType<typeof createPipeline>>[0]) =>
    createPipeline(await llmConfig(), createAnnotator(env.NLP_URL))(input);
  app.route("/stories", storyRoutes({ db, settings, limiter, pipeline }));

  const annotateOfficial: ReturnType<typeof createOfficialAnnotator> = async (input, now) =>
    createOfficialAnnotator(await llmConfig(), createAnnotator(env.NLP_URL))(input, now);
  app.route("/admin", adminRoutes({ db, settings, annotateOfficial }));
  app.route("/admin/ops", opsRoutes(db, env));

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    captureException(err, { path: c.req.path, method: c.req.method });
    recordOpsEvent(db, "api_error", {
      path: routeLabel(c.req.path),
      method: c.req.method,
      message: String(err).slice(0, 500),
    }).catch(() => undefined);
    return c.json({ error: "internal" }, 500);
  });
  return app;
}
