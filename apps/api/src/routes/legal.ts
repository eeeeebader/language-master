import { createHash } from "node:crypto";
import { consents, type Db, legalDocuments } from "@lm/database";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ulid } from "../lib/ulid";

export const LEGAL_DOCUMENTS = ["agb", "privacy", "impressum"] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/** Latest published version of each legal document for a locale. */
export async function currentLegal(db: Db, locale: string) {
  const out: Record<
    string,
    { version: number; markdown: string; requires_reconsent: boolean; published_at: string }
  > = {};
  for (const document of LEGAL_DOCUMENTS) {
    const row = (
      await db
        .select()
        .from(legalDocuments)
        .where(
          and(
            eq(legalDocuments.document, document),
            eq(legalDocuments.locale, locale),
            isNotNull(legalDocuments.publishedAt),
          ),
        )
        .orderBy(desc(legalDocuments.version))
        .limit(1)
    )[0];
    if (row)
      out[document] = {
        version: row.version,
        markdown: row.markdown,
        requires_reconsent: row.requiresReconsent,
        published_at: (row.publishedAt as Date).toISOString(),
      };
  }
  return out;
}

/** Pure: which documents the user still has to accept. */
export function pendingConsents(
  current: Record<string, { version: number; requires_reconsent: boolean }>,
  accepted: Record<string, number>,
): string[] {
  return Object.entries(current)
    .filter(([doc, c]) => doc !== "impressum")
    .filter(([doc, c]) => {
      const have = accepted[doc];
      if (have === undefined) return true;
      return c.requires_reconsent && have < c.version;
    })
    .map(([doc]) => doc);
}

/** Public: current legal texts (the app shows these instead of the bundled drafts when online). */
export function legalRoutes(db: Db) {
  const app = new Hono();
  app.get("/current", async (c) => {
    const locale = c.req.query("locale") ?? "de";
    c.header("cache-control", "public, max-age=60, must-revalidate");
    return c.json({ locale, documents: await currentLegal(db, locale) });
  });
  return app;
}

/** Authenticated: the user's consents and recording a new one. */
export function consentRoutes(db: Db) {
  const app = new Hono();

  app.get("/", async (c) => {
    const user = c.get("user");
    const rows = await db.select().from(consents).where(eq(consents.userId, user.id));
    const accepted: Record<string, number> = {};
    for (const r of rows) accepted[r.document] = Math.max(accepted[r.document] ?? 0, r.version);
    const current = await currentLegal(db, c.req.query("locale") ?? "de");
    return c.json({ accepted, pending: pendingConsents(current, accepted), current });
  });

  app.post("/", async (c) => {
    const user = c.get("user");
    const parsed = z
      .object({ document: z.enum(["agb", "privacy"]), version: z.number().int().positive() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request" }, 400);
    const { document, version } = parsed.data;
    const current = await currentLegal(db, "de");
    const cur = current[document];
    if (cur && version > cur.version) return c.json({ error: "unknown version" }, 400);
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "";
    await db
      .insert(consents)
      .values({
        id: ulid(),
        userId: user.id,
        document,
        version,
        ipHash: ip ? createHash("sha256").update(ip).digest("hex") : null,
      })
      .onConflictDoNothing();
    return c.json({ recorded: true, document, version });
  });

  return app;
}
