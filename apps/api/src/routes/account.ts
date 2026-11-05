import { createHash } from "node:crypto";
import {
  cardVariants,
  consents,
  type Db,
  deletedAccounts,
  entitlements,
  lists,
  listWords,
  reviewEvents,
  stories,
  streakLog,
  tokenLedger,
  userSettings,
  users,
  userWords,
  wordSentences,
} from "@lm/database";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Env } from "../env";
import { log } from "../lib/log";
import { ulid } from "../lib/ulid";

/** DSGVO Art. 15: everything we hold about the user as one JSON document. */
export async function exportAccount(db: Db, userId: string) {
  const u = eq(users.id, userId);
  const [
    profile,
    settings,
    ent,
    ledger,
    cons,
    words,
    variants,
    sentences,
    ls,
    lw,
    events,
    st,
    streak,
  ] = await Promise.all([
    db.select().from(users).where(u),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
    db.select().from(entitlements).where(eq(entitlements.userId, userId)),
    db.select().from(tokenLedger).where(eq(tokenLedger.userId, userId)),
    db.select().from(consents).where(eq(consents.userId, userId)),
    db.select().from(userWords).where(eq(userWords.userId, userId)),
    db.select().from(cardVariants).where(eq(cardVariants.userId, userId)),
    db.select().from(wordSentences).where(eq(wordSentences.userId, userId)),
    db.select().from(lists).where(eq(lists.userId, userId)),
    db.select().from(listWords).where(eq(listWords.userId, userId)),
    db.select().from(reviewEvents).where(eq(reviewEvents.userId, userId)),
    db.select().from(stories).where(eq(stories.userId, userId)),
    db.select().from(streakLog).where(eq(streakLog.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile: profile[0] ?? null,
    settings: settings[0] ?? null,
    entitlements: ent[0] ?? null,
    tokenLedger: ledger,
    consents: cons,
    words,
    variants,
    sentences,
    lists: ls,
    listWords: lw,
    reviewEvents: events,
    stories: st,
    streakLog: streak,
  };
}

/**
 * DSGVO Art. 17: delete the auth user (cascades through every user-owned table) and keep a
 * minimal pseudonymised purchase record for tax law (§ 147 AO).
 */
export async function deleteAccount(db: Db, userId: string, email: string | null) {
  await db.transaction(async (tx) => {
    const ent = (
      await tx.select().from(entitlements).where(eq(entitlements.userId, userId)).limit(1)
    )[0];
    const purchases = await tx
      .select({ n: sql<number>`count(*)::int`, tokens: sql<number>`coalesce(sum(delta), 0)::int` })
      .from(tokenLedger)
      .where(sql`${tokenLedger.userId} = ${userId} and ${tokenLedger.reason} = 'purchase'`);
    await tx.insert(deletedAccounts).values({
      id: ulid(),
      emailHash: createHash("sha256")
        .update((email ?? userId).toLowerCase())
        .digest("hex"),
      purchaseTotalCents: 0,
      tokenPurchases: purchases[0]?.tokens ?? 0,
      wasPremium: ent?.isPremium ?? false,
    });
    await tx.execute(sql`delete from auth.users where id = ${userId}`);
  });
  log.info("account deleted", { userId });
}

export function accountRoutes(db: Db, _env: Env) {
  const app = new Hono();
  app.post("/export", async (c) => c.json(await exportAccount(db, c.get("user").id)));
  app.delete("/", async (c) => {
    const u = c.get("user");
    await deleteAccount(db, u.id, u.email);
    return c.json({ deleted: true });
  });
  return app;
}
