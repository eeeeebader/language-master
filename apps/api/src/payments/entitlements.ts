import { type Db, entitlements, tokenLedger } from "@lm/database";
import { eq, sql } from "drizzle-orm";
import { ulid } from "../lib/ulid";

export type PurchaseKind = "premium" | "tokens_10" | "tokens_50" | "support";
export type PurchaseSource = "stripe" | "apple" | "google" | "admin_grant";

export interface Purchase {
  userId: string;
  kind: PurchaseKind;
  source: PurchaseSource;
  /** Provider's transaction id; makes the write idempotent. */
  refId: string;
  amountCents?: number;
}

export const TOKENS_BY_KIND: Record<PurchaseKind, number> = {
  premium: 25,
  tokens_10: 10,
  tokens_50: 50,
  support: 0,
};

/** Apply a purchase once: entitlements and token ledger in one transaction, idempotent on (reason, ref_id). */
export async function applyPurchase(
  db: Db,
  p: Purchase,
  premiumIncludedTokens = TOKENS_BY_KIND.premium,
) {
  return db.transaction(async (tx) => {
    const tokens = p.kind === "premium" ? premiumIncludedTokens : TOKENS_BY_KIND[p.kind];
    if (tokens > 0) {
      const inserted = await tx
        .insert(tokenLedger)
        .values({
          id: ulid(),
          userId: p.userId,
          delta: tokens,
          reason: "purchase",
          refId: `${p.source}:${p.refId}`,
        })
        .onConflictDoNothing()
        .returning({ id: tokenLedger.id });
      if (inserted.length === 0) return { applied: false as const };
      await tx
        .insert(entitlements)
        .values({ userId: p.userId, storyTokens: tokens, source: p.source })
        .onConflictDoUpdate({
          target: entitlements.userId,
          set: {
            storyTokens: sql`${entitlements.storyTokens} + ${tokens}`,
            source: p.source,
            updatedAt: new Date(),
          },
        });
    }
    if (p.kind === "premium") {
      await tx
        .insert(entitlements)
        .values({ userId: p.userId, isPremium: true, source: p.source })
        .onConflictDoUpdate({
          target: entitlements.userId,
          set: { isPremium: true, source: p.source, updatedAt: new Date() },
        });
    }
    if (p.kind === "support") {
      await tx
        .insert(entitlements)
        .values({
          userId: p.userId,
          isSupporter: true,
          supporterSince: new Date(),
          source: p.source,
        })
        .onConflictDoUpdate({
          target: entitlements.userId,
          set: {
            isSupporter: true,
            supporterSince: sql`coalesce(${entitlements.supporterSince}, now())`,
            updatedAt: new Date(),
          },
        });
    }
    return { applied: true as const, tokens };
  });
}

export async function getEntitlement(db: Db, userId: string) {
  return (
    (await db.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1))[0] ??
    null
  );
}
