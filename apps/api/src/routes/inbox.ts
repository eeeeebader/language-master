import { changelog, type Db, legalDocuments } from "@lm/database";
import { desc, gt } from "drizzle-orm";
import { Hono } from "hono";

export interface Announcement {
  id: string;
  title: string;
  markdown: string;
  at: string;
}

/**
 * In-app inbox: changelog entries, legal updates that require re-consent and announcements
 * (app_settings "announcements"). Never pushed as system notifications; fetched on sync.
 */
export function inboxRoutes(db: Db, announcements: () => Promise<Announcement[]>) {
  const app = new Hono();
  app.get("/", async (c) => {
    const since = c.req.query("since");
    const locale = c.req.query("locale") ?? "de";
    const sinceDate = since ? new Date(since) : new Date(0);
    const [entries, legal, ann] = await Promise.all([
      db
        .select()
        .from(changelog)
        .where(gt(changelog.publishedAt, sinceDate))
        .orderBy(desc(changelog.publishedAt))
        .limit(50),
      db
        .select()
        .from(legalDocuments)
        .where(gt(legalDocuments.createdAt, sinceDate))
        .orderBy(desc(legalDocuments.createdAt))
        .limit(20),
      announcements(),
    ]);
    const items = [
      ...entries
        .filter((e) => e.locale === locale)
        .map((e) => ({
          id: `changelog:${e.id}`,
          kind: "changelog" as const,
          title: `Neu in Version ${e.version}`,
          markdown: e.markdown,
          at: e.publishedAt.toISOString(),
        })),
      ...legal
        .filter((l) => l.locale === locale && l.publishedAt)
        .map((l) => ({
          id: `legal:${l.id}`,
          kind: "legal" as const,
          title:
            l.document === "agb"
              ? `Neue AGB (Version ${l.version})`
              : l.document === "privacy"
                ? `Neue Datenschutzerklärung (Version ${l.version})`
                : "Impressum aktualisiert",
          markdown: l.requiresReconsent
            ? "Bitte lies und bestätige die neue Fassung bei der nächsten Anmeldung."
            : "Die aktualisierte Fassung findest du in den Einstellungen.",
          at: (l.publishedAt as Date).toISOString(),
          requiresReconsent: l.requiresReconsent,
          document: l.document,
          version: l.version,
        })),
      ...ann
        .filter((a) => new Date(a.at) > sinceDate)
        .map((a) => ({ kind: "announcement" as const, ...a, id: `announcement:${a.id}` })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    c.header("cache-control", "private, max-age=60");
    return c.json({ items, fetchedAt: new Date().toISOString() });
  });
  return app;
}
