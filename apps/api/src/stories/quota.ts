import { type Db, entitlements, stories, tokenLedger } from "@lm/database";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { ulid } from "../lib/ulid";

export interface QuotaState {
  freePerDay: number;
  usedToday: number;
  tokens: number;
}

export type QuotaDecision =
  | { ok: true; payment: "free" | "token" }
  | { ok: false; reason: "no_tokens" };

/** Pure gate: the free story first, then a token. */
export function decideQuota(q: QuotaState): QuotaDecision {
  if (q.usedToday < q.freePerDay) return { ok: true, payment: "free" };
  if (q.tokens > 0) return { ok: true, payment: "token" };
  return { ok: false, reason: "no_tokens" };
}

function startOfUtcDay(now: Date) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Reserve a generation: counts today's non-failed stories, decides, and debits a token inside the
 * same transaction that will create the story row. Returns the ledger entry id to refund on failure.
 */
export async function reserveGeneration(
  db: Db,
  userId: string,
  storyId: string,
  freePerDay: number,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const ent = (
      await tx
        .select()
        .from(entitlements)
        .where(eq(entitlements.userId, userId))
        .for("update")
        .limit(1)
    )[0];
    const usedRows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(stories)
      .where(
        and(
          eq(stories.userId, userId),
          eq(stories.source, "ai"),
          gte(stories.createdAt, startOfUtcDay(now)),
          isNull(stories.deletedAt),
          sql`${stories.status} <> 'failed'`,
        ),
      );
    const decision = decideQuota({
      freePerDay,
      usedToday: usedRows[0]?.n ?? 0,
      tokens: ent?.storyTokens ?? 0,
    });
    if (!decision.ok) return { ok: false as const, reason: decision.reason };
    let ledgerId: string | null = null;
    if (decision.payment === "token") {
      ledgerId = ulid();
      await tx
        .insert(tokenLedger)
        .values({ id: ledgerId, userId, delta: -1, reason: "story", refId: storyId });
      await tx
        .update(entitlements)
        .set({ storyTokens: sql`${entitlements.storyTokens} - 1`, updatedAt: now })
        .where(eq(entitlements.userId, userId));
    }
    return { ok: true as const, payment: decision.payment, ledgerId };
  });
}

/** Refund is a reverse ledger entry, never an in-place update. */
export async function refundGeneration(db: Db, userId: string, storyId: string) {
  await db.transaction(async (tx) => {
    await tx
      .insert(tokenLedger)
      .values({ id: ulid(), userId, delta: 1, reason: "refund", refId: storyId })
      .onConflictDoNothing();
    await tx
      .update(entitlements)
      .set({ storyTokens: sql`${entitlements.storyTokens} + 1`, updatedAt: new Date() })
      .where(eq(entitlements.userId, userId));
  });
}
