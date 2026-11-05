import { type Db, llmUsage, reviewEvents, stories, userWords } from "@lm/database";
import { StoryRequest } from "@lm/schema";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { log } from "../lib/log";
import { recordStory } from "../lib/ops";
import type { GenerationLimiter } from "../lib/rateLimit";
import { ulid } from "../lib/ulid";
import type { SettingsStore } from "../settings";
import type { createPipeline } from "../stories/pipeline";
import { refundGeneration, reserveGeneration } from "../stories/quota";

export interface StoriesDeps {
  db: Db;
  settings: SettingsStore;
  limiter: GenerationLimiter;
  pipeline: ReturnType<typeof createPipeline>;
}

/** Strongest known lemmas by stability, optionally restricted to the chosen source lists. */
async function knownLemmas(db: Db, userId: string, language: string, max: number) {
  const rows = await db
    .select({ lemma: userWords.lemma })
    .from(userWords)
    .where(
      and(
        eq(userWords.userId, userId),
        eq(userWords.language, language),
        isNull(userWords.deletedAt),
        isNotNull(userWords.srsStability),
      ),
    )
    .orderBy(desc(userWords.srsStability))
    .limit(max);
  return rows.map((r) => r.lemma);
}

/** Lemmas with an Again grade in the last 14 days. */
async function failedLemmas(db: Db, userId: string, language: string) {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const rows = await db
    .selectDistinct({ lemma: userWords.lemma })
    .from(reviewEvents)
    .innerJoin(userWords, eq(userWords.id, reviewEvents.wordId))
    .where(
      and(
        eq(reviewEvents.userId, userId),
        eq(userWords.language, language),
        eq(reviewEvents.grade, 4),
        gte(reviewEvents.reviewedAt, since),
      ),
    )
    .limit(30);
  return rows.map((r) => r.lemma);
}

/** Public: published official texts for a language; the app merges them into its library. */
export function officialStoryRoutes(db: Db) {
  const app = new Hono();
  app.get("/official", async (c) => {
    const language = c.req.query("language") ?? "es";
    const rows = await db
      .select({ id: stories.id, document: stories.documentJson, updatedAt: stories.updatedAt })
      .from(stories)
      .where(
        and(
          eq(stories.source, "official"),
          eq(stories.status, "published"),
          eq(stories.language, language),
          isNull(stories.deletedAt),
        ),
      )
      .orderBy(desc(stories.updatedAt))
      .limit(100);
    c.header("cache-control", "public, max-age=300");
    return c.json({ stories: rows.map((r) => r.document), fetchedAt: new Date().toISOString() });
  });
  return app;
}

export function storyRoutes(deps: StoriesDeps) {
  const app = new Hono();

  app.post("/generate", async (c) => {
    const user = c.get("user");
    const parsed = StoryRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "invalid request", issues: parsed.error.issues.slice(0, 5) }, 400);
    const request = parsed.data;
    if (await deps.settings.get("maintenance", false)) return c.json({ error: "maintenance" }, 503);

    const release = deps.limiter.acquire(user.id);
    if (!release) return c.json({ error: "rate_limited" }, 429);

    const storyId = ulid();
    const startedAt = Date.now();
    try {
      const freePerDay = await deps.settings.get("stories.free_per_day", 1);
      const reservation = await reserveGeneration(deps.db, user.id, storyId, freePerDay);
      if (!reservation.ok) {
        deps.limiter.refundDaily(user.id);
        recordStory("rejected");
        return c.json({ error: reservation.reason }, 402);
      }
      await deps.db.insert(stories).values({
        id: storyId,
        userId: user.id,
        language: request.language,
        native: request.native,
        title: "…",
        theme: request.theme,
        grammarFocus: request.grammarFocus,
        level: request.level,
        source: "ai",
        status: "generating",
        documentJson: {},
        sourceLists: request.sourceLists,
      });

      const maxKnown = await deps.settings.get("llm.max_known_lemmas", 600);
      const [known, failed] = await Promise.all([
        knownLemmas(deps.db, user.id, request.language, maxKnown),
        failedLemmas(deps.db, user.id, request.language),
      ]);
      const result = await deps.pipeline({
        storyId,
        request,
        knownLemmas: known,
        failedLemmas: failed,
      });

      const cost = result.usage.reduce((a, u) => a + u.costCents, 0);
      if (result.usage.length)
        await deps.db.insert(llmUsage).values(
          result.usage.map((u) => ({
            id: ulid(),
            storyId,
            userId: user.id,
            step: u.step,
            model: u.model,
            tokensIn: u.tokensIn,
            tokensOut: u.tokensOut,
            costCents: u.costCents,
          })),
        );

      if (!result.ok) {
        await deps.db
          .update(stories)
          .set({ status: "failed", generationCostCents: cost, updatedAt: new Date() })
          .where(eq(stories.id, storyId));
        if (reservation.payment === "token") await refundGeneration(deps.db, user.id, storyId);
        deps.limiter.refundDaily(user.id);
        recordStory("failed", undefined, cost);
        log.warn("story generation failed", {
          storyId,
          reason: result.reason,
          attempts: result.attempts,
        });
        return c.json(
          {
            error: "generation_failed",
            reason: result.reason,
            refunded: reservation.payment === "token",
          },
          502,
        );
      }

      await deps.db
        .update(stories)
        .set({
          title: result.document.title,
          status: "ready",
          documentJson: result.document,
          generationCostCents: cost,
          updatedAt: new Date(),
        })
        .where(eq(stories.id, storyId));
      recordStory("ok", Date.now() - startedAt, cost);
      log.info("story generated", {
        storyId,
        attempts: result.attempts,
        coverage: result.coverage,
        costCents: cost,
      });
      return c.json({
        story: result.document,
        payment: reservation.payment,
        coverage: result.coverage,
      });
    } catch (e) {
      recordStory("error");
      log.error("story pipeline error", { storyId, error: String(e) });
      await deps.db
        .update(stories)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(stories.id, storyId))
        .catch(() => undefined);
      await refundGeneration(deps.db, user.id, storyId).catch(() => undefined);
      deps.limiter.refundDaily(user.id);
      return c.json({ error: "generation_failed" }, 502);
    } finally {
      release();
    }
  });

  /** Daily LLM spend for the admin's cost dashboard. */
  app.get("/usage/daily", async (c) => {
    const rows = await deps.db
      .select({
        day: sql<string>`date_trunc('day', created_at)::date`,
        cents: sql<number>`sum(cost_cents)::float`,
      })
      .from(llmUsage)
      .groupBy(sql`date_trunc('day', created_at)`)
      .orderBy(desc(sql`date_trunc('day', created_at)`))
      .limit(90);
    return c.json(rows);
  });

  return app;
}
