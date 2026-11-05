import { type Db, dictionaryPacks } from "@lm/database";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";

/** Public pack manifest: the app checks it on launch and downloads the pack when newer. */
export function packRoutes(db: Db) {
  const app = new Hono();
  app.get("/manifest", async (c) => {
    const target = c.req.query("target") ?? "es";
    const native = c.req.query("native") ?? "de";
    const row = await db
      .select()
      .from(dictionaryPacks)
      .where(
        and(
          eq(dictionaryPacks.target, target),
          eq(dictionaryPacks.native, native),
          isNotNull(dictionaryPacks.publishedAt),
        ),
      )
      .orderBy(desc(dictionaryPacks.version))
      .limit(2);
    const base = row.find((r) => !r.withAudio) ?? row[0];
    if (!base) return c.json({ error: "no pack" }, 404);
    const audio = row.find((r) => r.withAudio && r.version === base.version);
    c.header("cache-control", "public, max-age=60, must-revalidate");
    return c.json({
      target: base.target,
      native: base.native,
      version: base.version,
      url: base.url,
      bytes: base.bytes,
      sha256: base.sha256,
      with_audio: !!audio,
      audio_url: audio?.url,
      audio_bytes: audio?.bytes,
      audio_sha256: audio?.sha256,
      published_at: (base.publishedAt as Date).toISOString(),
    });
  });
  return app;
}
