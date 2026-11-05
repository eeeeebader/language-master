import { type Db, jobs, users } from "@lm/database";
import { and, isNull, lt, sql } from "drizzle-orm";
import { log } from "../lib/log";
import { ulid } from "../lib/ulid";
import { deleteAccount } from "../routes/account";

export interface RetentionPolicy {
  contentAfterDays: number; // soft-delete learning content
  hardDeleteAfterDays: number; // hard-delete soft-deleted content
  accountAfterDays: number; // delete the account
  warnBeforeDays: number;
}

export const DEFAULT_POLICY: RetentionPolicy = {
  contentAfterDays: 365,
  hardDeleteAfterDays: 30,
  accountAfterDays: 730,
  warnBeforeDays: 30,
};

const daysAgo = (n: number, now: Date) => new Date(now.getTime() - n * 86_400_000);

const CONTENT_TABLES = [
  "lists",
  "list_words",
  "user_words",
  "card_variants",
  "word_sentences",
  "stories",
] as const;

/** Nightly, idempotent. Every run writes a jobs row with counts. */
export async function runRetention(
  db: Db,
  policy = DEFAULT_POLICY,
  now = new Date(),
  sendWarning?: (email: string) => Promise<void>,
) {
  const jobId = ulid();
  await db.insert(jobs).values({ id: jobId, name: "retention", status: "running" });
  const summary: Record<string, number> = {
    warned: 0,
    softDeleted: 0,
    hardDeleted: 0,
    accountsDeleted: 0,
  };
  try {
    // 1. warn 30 days before the content cut
    const warnCut = daysAgo(policy.contentAfterDays - policy.warnBeforeDays, now);
    const toWarn = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        and(
          lt(users.lastLoginAt, warnCut),
          isNull(users.retentionWarnedAt),
          isNull(users.deletedAt),
        ),
      );
    for (const u of toWarn) {
      if (u.email && sendWarning)
        await sendWarning(u.email).catch((e) =>
          log.warn("warning mail failed", { error: String(e) }),
        );
      await db.update(users).set({ retentionWarnedAt: now }).where(sql`${users.id} = ${u.id}`);
      summary.warned = (summary.warned ?? 0) + 1;
    }

    // 2. soft-delete content of users inactive for a year (all tiers)
    const contentCut = daysAgo(policy.contentAfterDays, now);
    for (const t of CONTENT_TABLES) {
      const r = await db.execute(
        sql`update ${sql.identifier(t)} set deleted_at = ${now} where deleted_at is null and user_id in (select id from users where last_login_at < ${contentCut})`,
      );
      summary.softDeleted =
        (summary.softDeleted ?? 0) + Number((r as unknown as { count?: number }).count ?? 0);
    }
    await db.execute(
      sql`delete from review_events where user_id in (select id from users where last_login_at < ${contentCut})`,
    );

    // 3. hard-delete content that has been soft-deleted for 30 days
    const hardCut = daysAgo(policy.hardDeleteAfterDays, now);
    for (const t of [...CONTENT_TABLES].reverse()) {
      const r = await db.execute(
        sql`delete from ${sql.identifier(t)} where deleted_at is not null and deleted_at < ${hardCut}`,
      );
      summary.hardDeleted =
        (summary.hardDeleted ?? 0) + Number((r as unknown as { count?: number }).count ?? 0);
    }

    // 4. delete accounts inactive for two years, keeping the pseudonymised tax record
    const accountCut = daysAgo(policy.accountAfterDays, now);
    const stale = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(lt(users.lastLoginAt, accountCut));
    for (const u of stale) {
      await deleteAccount(db, u.id, u.email);
      summary.accountsDeleted = (summary.accountsDeleted ?? 0) + 1;
    }

    await db
      .update(jobs)
      .set({ status: "ok", finishedAt: new Date(), summary })
      .where(sql`${jobs.id} = ${jobId}`);
    log.info("retention done", summary);
  } catch (e) {
    await db
      .update(jobs)
      .set({ status: "failed", finishedAt: new Date(), summary: { ...summary, error: String(e) } })
      .where(sql`${jobs.id} = ${jobId}`);
    log.error("retention failed", { error: String(e) });
  }
  return summary;
}
