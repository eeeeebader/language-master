import { type Db, jobs, llmUsage, opsEvents, stories } from "@lm/database";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireRole } from "../auth";
import type { Env } from "../env";
import { processStats } from "../lib/ops";
import { ulid } from "../lib/ulid";

export async function recordOpsEvent(db: Db, kind: string, data: Record<string, unknown>) {
  await db.insert(opsEvents).values({ id: ulid(), kind, data });
}

async function ping(
  url: string,
  timeoutMs = 3000,
): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return {
      ok: res.ok,
      ms: Math.round(performance.now() - t0),
      error: res.ok ? undefined : `http ${res.status}`,
    };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: String(e).slice(0, 120) };
  }
}

/** GET /admin/ops: everything the admin "Betrieb" module shows. Staff only. */
export function opsRoutes(db: Db, env: Env) {
  const app = new Hono();
  app.get("/", requireRole(["admin", "editor", "analyst"]), async (c) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const t0 = performance.now();
    const [dbOk, nlp, piper, costByDay, storiesByDay, failures, errors, recentJobs] =
      await Promise.all([
        db
          .execute(sql`select 1`)
          .then(() => ({ ok: true, ms: Math.round(performance.now() - t0) }))
          .catch((e) => ({ ok: false, ms: 0, error: String(e) })),
        ping(`${env.NLP_URL}/health`),
        env.PIPER_URL ? ping(env.PIPER_URL) : Promise.resolve(null),
        db
          .select({
            day: sql<string>`to_char(date_trunc('day', ${llmUsage.createdAt}), 'YYYY-MM-DD')`,
            step: llmUsage.step,
            cents: sql<number>`round(sum(${llmUsage.costCents})::numeric, 2)::float8`,
            tokens_in: sql<number>`sum(${llmUsage.tokensIn})::int`,
            tokens_out: sql<number>`sum(${llmUsage.tokensOut})::int`,
          })
          .from(llmUsage)
          .where(gte(llmUsage.createdAt, since))
          .groupBy(sql`1`, llmUsage.step)
          .orderBy(sql`1`),
        db
          .select({
            day: sql<string>`to_char(date_trunc('day', ${stories.createdAt}), 'YYYY-MM-DD')`,
            ok: sql<number>`count(*) filter (where ${stories.status} in ('ready','published'))::int`,
            failed: sql<number>`count(*) filter (where ${stories.status} = 'failed')::int`,
          })
          .from(stories)
          .where(and(eq(stories.source, "ai"), gte(stories.createdAt, since)))
          .groupBy(sql`1`)
          .orderBy(sql`1`),
        db
          .select()
          .from(opsEvents)
          .where(and(eq(opsEvents.kind, "pack_failure"), gte(opsEvents.at, since)))
          .orderBy(desc(opsEvents.at))
          .limit(200),
        db
          .select()
          .from(opsEvents)
          .where(eq(opsEvents.kind, "api_error"))
          .orderBy(desc(opsEvents.at))
          .limit(50),
        db.select().from(jobs).orderBy(desc(jobs.startedAt)).limit(20),
      ]);
    const failureCounts: Record<string, number> = {};
    for (const f of failures) {
      const d = f.data as { kind?: string; reason?: string };
      const k = `${d.kind ?? "?"}/${d.reason ?? "?"}`;
      failureCounts[k] = (failureCounts[k] ?? 0) + 1;
    }
    const okTotal = storiesByDay.reduce((a, d) => a + d.ok, 0);
    const failedTotal = storiesByDay.reduce((a, d) => a + d.failed, 0);
    return c.json({
      checked_at: new Date().toISOString(),
      services: { database: dbOk, nlp, piper },
      process: processStats(),
      stories: {
        days: storiesByDay,
        success_rate_30d: okTotal + failedTotal ? okTotal / (okTotal + failedTotal) : null,
      },
      llm_cost: { days: costByDay, total_cents_30d: costByDay.reduce((a, d) => a + d.cents, 0) },
      pack_failures: {
        total_30d: failures.length,
        by_kind_reason: failureCounts,
        recent: failures.slice(0, 20),
      },
      errors: errors.map((e) => ({ id: e.id, at: e.at, ...(e.data as Record<string, unknown>) })),
      jobs: recentJobs,
    });
  });
  return app;
}
