import { type Db, dictionaryPacks } from "@lm/database";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Clip, DEFAULT_VOICE, renderSpeech } from "../lib/speech";
import { recordOpsEvent } from "./ops";

/** Public pack manifest: the app checks it on launch and downloads the pack when newer. */
export function packRoutes(db: Db, piperUrl?: string) {
  const app = new Hono();
  const tts = new Map<string, Clip>();
  /**
   * On-demand speech for texts no pack covers (rare headwords, user sentences). Piper renders
   * them; recent clips stay in memory so repeated plays are free.
   */
  app.get("/tts", async (c) => {
    const text = (c.req.query("text") ?? "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 400) return c.json({ error: "invalid" }, 400);
    if (!piperUrl) return c.json({ error: "no tts" }, 503);
    const voice = c.req.query("voice") ?? DEFAULT_VOICE;
    const key = `${voice}\n${text}`;
    let clip = tts.get(key);
    if (!clip) {
      const rendered = await renderSpeech(piperUrl, text, voice);
      if (!rendered) return c.json({ error: "tts failed" }, 502);
      clip = rendered;
      if (tts.size >= 2000) tts.delete(tts.keys().next().value as string);
      tts.set(key, clip);
    }
    return new Response(clip.bytes.slice().buffer, {
      headers: { "content-type": clip.mime, "cache-control": "public, max-age=2592000, immutable" },
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
      .orderBy(desc(dictionaryPacks.version));
    const base = row.find((r) => !r.withAudio);
    if (!base) return c.json({ error: "no pack" }, 404);
    // Audio clips are keyed by text, so the newest published audio pack serves any dictionary version.
    const audio = row.find((r) => r.withAudio && (r.audioTier ?? "core") === "core");
    const full = row.find((r) => r.withAudio && r.audioTier === "full");
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
      audio_full_url: full?.url,
      audio_full_bytes: full?.bytes,
      audio_full_sha256: full?.sha256,
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
