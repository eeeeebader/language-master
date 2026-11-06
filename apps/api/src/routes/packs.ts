import { type Db, dictionaryPacks } from "@lm/database";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { recordOpsEvent } from "./ops";

/** Public pack manifest: the app checks it on launch and downloads the pack when newer. */
export function packRoutes(db: Db, piperUrl?: string) {
  const app = new Hono();
  const tts = new Map<string, Uint8Array>();
  /**
   * On-demand speech for texts the audio pack does not cover (dictionary words outside the pack,
   * story sentences). Piper renders them; recent clips stay in memory so repeated plays are free.
   */
  app.get("/tts", async (c) => {
    const text = (c.req.query("text") ?? "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 400) return c.json({ error: "invalid" }, 400);
    if (!piperUrl) return c.json({ error: "no tts" }, 503);
    const voice = c.req.query("voice") ?? "es_ES-davefx-medium";
    const key = `${voice}\n${text}`;
    let wav = tts.get(key);
    if (!wav) {
      const res = await fetch(piperUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ text, voice }),
      }).catch(() => null);
      if (!res?.ok) return c.json({ error: "tts failed" }, 502);
      wav = new Uint8Array(await res.arrayBuffer());
      if (tts.size >= 2000) tts.delete(tts.keys().next().value as string);
      tts.set(key, wav);
    }
    return new Response(wav.slice().buffer, {
      headers: {
        "content-type": "audio/wav",
        "cache-control": "public, max-age=2592000, immutable",
      },
    });
  });
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
