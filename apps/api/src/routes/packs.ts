import { type Db, dictionaryPacks } from "@lm/database";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { recordOpsEvent } from "./ops";

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
    // Audio clips are keyed by text, so the newest published audio pack serves any dictionary version.
    const audio = row.find((r) => r.withAudio);
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
  /** Clients report a failed download or checksum so the dashboard can show it. */
  app.post("/report", async (c) => {
    const parsed = z
      .object({
        kind: z.enum(["dictionary", "audio"]),
        reason: z.enum(["network", "http", "checksum", "storage", "open"]),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    await recordOpsEvent(db, "pack_failure", parsed.data);
    return c.json({ ok: true });
  });
  return app;
}
