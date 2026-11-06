import {
  appSettings,
  auditLog,
  changelog,
  type Db,
  dictionaryPacks,
  entitlements,
  featureFlags,
  jobs,
  languages,
  lectures,
  legalDocuments,
  lemmaOverrides,
  stories,
  tokenLedger,
  users,
} from "@lm/database";
import { Lecture as LectureSchema, StoryDocument as StoryDocumentSchema } from "@lm/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../admin/audit";
import { canEnablePair, mergeFlag } from "../admin/languages";
import { type createOfficialAnnotator, OfficialInput } from "../admin/official";
import { requireRole } from "../auth";
import { runRetention } from "../cron/retention";
import { log } from "../lib/log";
import { ulid } from "../lib/ulid";
import type { SettingsStore } from "../settings";
import { deleteAccount, exportAccount } from "./account";

export interface AdminDeps {
  db: Db;
  settings: SettingsStore;
  annotateOfficial: ReturnType<typeof createOfficialAnnotator>;
}

const ADMIN = requireRole(["admin"]);
const EDITOR = requireRole(["admin", "editor"]);

async function body<T extends z.ZodTypeAny>(c: { req: { json(): Promise<unknown> } }, schema: T) {
  return schema.parse(await c.req.json().catch(() => ({}))) as z.infer<T>;
}

/**
 * Back-office endpoints for apps/admin. Contract: apps/admin/README.md.
 * Reads that need no secrets go through PostgREST with RLS; everything here is a write or needs
 * the service role, and every write lands in audit_log.
 */
export function adminRoutes({ db, settings, annotateOfficial }: AdminDeps) {
  const app = new Hono();
  const actor = (c: { get(k: "user"): { id: string } }) => c.get("user").id;

  // ---------- audit ----------
  app.get("/audit", ADMIN, async (c) => {
    const limit = Math.min(1000, Number(c.req.query("limit") ?? 200) || 200);
    const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
    return c.json(
      rows.map((r) => ({
        id: r.id,
        actor: r.actor,
        table: r.table,
        row_id: r.rowId,
        before: r.before,
        after: r.after,
        at: r.at,
      })),
    );
  });

  // ---------- users ----------
  app.post("/users/:id/grant-tokens", ADMIN, async (c) => {
    const id = c.req.param("id");
    const { delta, reason } = await body(
      c,
      z.object({ delta: z.number().int().min(-1000).max(1000), reason: z.string().min(1) }),
    );
    const result = await db.transaction(async (tx) => {
      const before = (await tx.select().from(entitlements).where(eq(entitlements.userId, id)))[0];
      if (!before) return null;
      await tx
        .insert(tokenLedger)
        .values({ id: ulid(), userId: id, delta, reason: "grant", refId: `admin:${reason}` });
      const after = (
        await tx
          .update(entitlements)
          .set({ storyTokens: sql`${entitlements.storyTokens} + ${delta}`, updatedAt: new Date() })
          .where(eq(entitlements.userId, id))
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "entitlements", id, before, after);
      return after;
    });
    if (!result) return c.json({ error: "user not found" }, 404);
    return c.json(result);
  });

  app.post("/users/:id/set-premium", ADMIN, async (c) => {
    const id = c.req.param("id");
    const { is_premium } = await body(c, z.object({ is_premium: z.boolean() }));
    const result = await db.transaction(async (tx) => {
      const before = (await tx.select().from(entitlements).where(eq(entitlements.userId, id)))[0];
      if (!before) return null;
      const after = (
        await tx
          .update(entitlements)
          .set({ isPremium: is_premium, source: "admin_grant", updatedAt: new Date() })
          .where(eq(entitlements.userId, id))
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "entitlements", id, before, after);
      return after;
    });
    if (!result) return c.json({ error: "user not found" }, 404);
    return c.json(result);
  });

  /** One call for everything an admin grants by hand: tier, supporter badge, free stories. */
  app.post("/users/:id/entitlements", ADMIN, async (c) => {
    const id = c.req.param("id");
    const patch = await body(
      c,
      z.object({
        is_premium: z.boolean().optional(),
        is_supporter: z.boolean().optional(),
        free_stories_per_day: z.number().int().min(0).max(100).nullable().optional(),
      }),
    );
    const result = await db.transaction(async (tx) => {
      const before = (await tx.select().from(entitlements).where(eq(entitlements.userId, id)))[0];
      if (!before) return null;
      const set: Partial<typeof before> = { updatedAt: new Date() };
      if (patch.is_premium !== undefined) {
        set.isPremium = patch.is_premium;
        set.source = "admin_grant";
      }
      if (patch.is_supporter !== undefined) {
        set.isSupporter = patch.is_supporter;
        set.supporterSince = patch.is_supporter ? (before.supporterSince ?? new Date()) : null;
      }
      if (patch.free_stories_per_day !== undefined)
        set.freeStoriesPerDay = patch.free_stories_per_day;
      const after = (
        await tx.update(entitlements).set(set).where(eq(entitlements.userId, id)).returning()
      )[0];
      await writeAudit(tx, actor(c), "entitlements", id, before, after);
      return after;
    });
    if (!result) return c.json({ error: "user not found" }, 404);
    return c.json(result);
  });

  app.get("/users/:id/export", ADMIN, async (c) => {
    const id = c.req.param("id");
    const data = await exportAccount(db, id);
    if (!data.profile) return c.json({ error: "user not found" }, 404);
    await writeAudit(db, actor(c), "users", id, null, { exported: true });
    return c.json(data);
  });

  app.post("/users/:id/delete", ADMIN, async (c) => {
    const id = c.req.param("id");
    const { reason } = await body(c, z.object({ reason: z.string().min(1) }));
    const before = (await db.select().from(users).where(eq(users.id, id)))[0];
    if (!before) return c.json({ error: "user not found" }, 404);
    await deleteAccount(db, id, before.email);
    await writeAudit(db, actor(c), "users", id, before, { deleted: true, reason });
    return c.json({ deleted: true });
  });

  // ---------- settings ----------
  app.post("/settings", ADMIN, async (c) => {
    const { key, value_json } = await body(
      c,
      z.object({ key: z.string().min(1), value_json: z.unknown() }),
    );
    const rows = await db.transaction(async (tx) => {
      const before = (await tx.select().from(appSettings).where(eq(appSettings.key, key)))[0];
      const after = (
        await tx
          .insert(appSettings)
          .values({ key, valueJson: value_json ?? null, version: 1, updatedBy: actor(c) })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: {
              valueJson: value_json ?? null,
              version: sql`${appSettings.version} + 1`,
              updatedBy: actor(c),
              updatedAt: new Date(),
            },
          })
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "app_settings", key, before ?? null, after);
      return tx.select().from(appSettings);
    });
    settings.invalidate();
    return c.json(
      rows.map((r) => ({
        key: r.key,
        value_json: r.valueJson,
        version: r.version,
        updated_by: r.updatedBy,
        updated_at: r.updatedAt,
      })),
    );
  });

  // ---------- legal ----------
  app.post("/legal", EDITOR, async (c) => {
    const input = await body(
      c,
      z.object({
        document: z.enum(["agb", "privacy", "impressum"]),
        locale: z.string().default("de"),
        markdown: z.string().min(1),
        requires_reconsent: z.boolean().default(false),
      }),
    );
    const row = await db.transaction(async (tx) => {
      const prev = (
        await tx
          .select({ v: sql<number>`coalesce(max(${legalDocuments.version}), 0)::int` })
          .from(legalDocuments)
          .where(
            and(
              eq(legalDocuments.document, input.document),
              eq(legalDocuments.locale, input.locale),
            ),
          )
      )[0];
      const r = (
        await tx
          .insert(legalDocuments)
          .values({
            id: ulid(),
            document: input.document,
            locale: input.locale,
            version: (prev?.v ?? 0) + 1,
            markdown: input.markdown,
            publishedAt: new Date(),
            requiresReconsent: input.requires_reconsent,
          })
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "legal_documents", r?.id ?? "", null, r);
      return r;
    });
    return c.json(row);
  });

  // ---------- changelog ----------
  app.post("/changelog", EDITOR, async (c) => {
    const input = await body(
      c,
      z.object({
        version: z.string().min(1),
        locale: z.string().default("de"),
        markdown: z.string().min(1),
      }),
    );
    const row = (
      await db
        .insert(changelog)
        .values({
          id: ulid(),
          version: input.version,
          locale: input.locale,
          markdown: input.markdown,
        })
        .returning()
    )[0];
    await writeAudit(db, actor(c), "changelog", row?.id ?? "", null, row);
    return c.json(row);
  });

  // ---------- jobs ----------
  app.post("/jobs/:id/retry", ADMIN, async (c) => {
    const id = c.req.param("id");
    const before = (await db.select().from(jobs).where(eq(jobs.id, id)))[0];
    if (!before) return c.json({ error: "job not found" }, 404);
    let after = before;
    if (before.name === "retention") {
      await runRetention(db);
      after = (await db.select().from(jobs).where(eq(jobs.id, id)))[0] ?? before;
    } else {
      // pack builds and audio renders run in the content-tools worker; re-queue for pickup.
      after =
        (
          await db
            .update(jobs)
            .set({ status: "queued", finishedAt: null, summary: { retriedFrom: before.summary } })
            .where(eq(jobs.id, id))
            .returning()
        )[0] ?? before;
    }
    await writeAudit(db, actor(c), "jobs", id, before, after);
    return c.json(after);
  });

  // ---------- lectures ----------
  app.post("/lectures", EDITOR, async (c) => {
    const { content_json } = await body(c, z.object({ content_json: LectureSchema }));
    const row = await db.transaction(async (tx) => {
      const before = (await tx.select().from(lectures).where(eq(lectures.id, content_json.id)))[0];
      const values = {
        id: content_json.id,
        language: content_json.language,
        slug: content_json.slug,
        version: (before?.version ?? 0) + 1,
        status: "draft",
        contentJson: content_json,
        sortOrder: before?.sortOrder ?? 0,
        updatedAt: new Date(),
      };
      const r = (
        await tx
          .insert(lectures)
          .values(values)
          .onConflictDoUpdate({ target: lectures.id, set: values })
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "lectures", content_json.id, before ?? null, r);
      return r;
    });
    return c.json(row?.contentJson ?? content_json);
  });

  app.post("/lectures/:id/publish", EDITOR, async (c) => {
    const id = c.req.param("id");
    const before = (await db.select().from(lectures).where(eq(lectures.id, id)))[0];
    if (!before) return c.json({ error: "lecture not found" }, 404);
    const after = (
      await db
        .update(lectures)
        .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(lectures.id, id))
        .returning()
    )[0];
    await writeAudit(db, actor(c), "lectures", id, before, after);
    return c.json(after);
  });

  app.post("/lectures/:id/render-audio", EDITOR, async (c) => {
    const id = c.req.param("id");
    const lecture = (await db.select().from(lectures).where(eq(lectures.id, id)))[0];
    if (!lecture) return c.json({ error: "lecture not found" }, 404);
    const job = (
      await db
        .insert(jobs)
        .values({
          id: ulid(),
          name: `render_audio:${id}`,
          status: "queued",
          summary: { lectureId: id },
        })
        .returning()
    )[0];
    await writeAudit(db, actor(c), "jobs", job?.id ?? "", null, job);
    return c.json(job);
  });

  // ---------- dictionary ----------
  app.post("/dictionary/build", EDITOR, async (c) => {
    const { target, native } = await body(
      c,
      z.object({ target: z.string().min(2).max(5), native: z.string().min(2).max(5) }),
    );
    const job = (
      await db
        .insert(jobs)
        .values({
          id: ulid(),
          name: `pack_build:${target}-${native}`,
          status: "queued",
          summary: { target, native, note: "picked up by the content-tools worker" },
        })
        .returning()
    )[0];
    await writeAudit(db, actor(c), "jobs", job?.id ?? "", null, job);
    return c.json(job);
  });

  app.post("/dictionary/:id/publish", ADMIN, async (c) => {
    const id = c.req.param("id");
    const before = (await db.select().from(dictionaryPacks).where(eq(dictionaryPacks.id, id)))[0];
    if (!before) return c.json({ error: "pack not found" }, 404);
    const after = (
      await db
        .update(dictionaryPacks)
        .set({ publishedAt: new Date() })
        .where(eq(dictionaryPacks.id, id))
        .returning()
    )[0];
    await writeAudit(db, actor(c), "dictionary_packs", id, before, after);
    return c.json(after);
  });

  app.post("/dictionary/override", EDITOR, async (c) => {
    const input = await body(
      c,
      z.object({
        language: z.string().min(2),
        lemma: z.string().min(1),
        patch: z.record(z.string(), z.unknown()),
      }),
    );
    const row = await db.transaction(async (tx) => {
      const before = (
        await tx
          .select()
          .from(lemmaOverrides)
          .where(
            and(eq(lemmaOverrides.language, input.language), eq(lemmaOverrides.lemma, input.lemma)),
          )
      )[0];
      const r = (
        await tx
          .insert(lemmaOverrides)
          .values({
            id: before?.id ?? ulid(),
            language: input.language,
            lemma: input.lemma,
            patch: input.patch,
            updatedBy: actor(c),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [lemmaOverrides.language, lemmaOverrides.lemma],
            set: { patch: input.patch, updatedBy: actor(c), updatedAt: new Date() },
          })
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "lemma_overrides", r?.id ?? "", before ?? null, r);
      return r;
    });
    return c.json(row);
  });

  // ---------- official stories ----------
  app.post("/stories/annotate", EDITOR, async (c) => {
    const input = await body(c, OfficialInput);
    const result = await annotateOfficial(input);
    if (!result.ok) {
      log.warn("official annotate failed", { reason: result.reason });
      return c.json({ error: result.reason }, 422);
    }
    return c.json(result.document);
  });

  app.post("/stories/publish", EDITOR, async (c) => {
    const input = await body(
      c,
      StoryDocumentSchema.extend({ status: z.enum(["draft", "published"]).default("published") }),
    );
    const { status, ...doc } = input;
    const row = await db.transaction(async (tx) => {
      const before = (await tx.select().from(stories).where(eq(stories.id, doc.id)))[0];
      const values = {
        id: doc.id,
        userId: null,
        language: doc.language,
        native: doc.native,
        title: doc.title,
        theme: doc.theme,
        grammarFocus: doc.grammarFocus ?? null,
        level: doc.level,
        source: "official",
        status,
        documentJson: doc,
        updatedAt: new Date(),
      };
      const r = (
        await tx
          .insert(stories)
          .values(values)
          .onConflictDoUpdate({ target: stories.id, set: values })
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "stories", doc.id, before ?? null, r);
      return r;
    });
    return c.json({
      id: row?.id,
      language: row?.language,
      title: row?.title,
      theme: row?.theme,
      status: row?.status,
      published_at: row?.updatedAt,
    });
  });

  // ---------- languages ----------
  app.post("/languages", ADMIN, async (c) => {
    const { target, native, enabled } = await body(
      c,
      z.object({ target: z.string().min(2), native: z.string().min(2), enabled: z.boolean() }),
    );
    if (enabled) {
      const [pack, lect] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(dictionaryPacks)
          .where(
            and(
              eq(dictionaryPacks.target, target),
              eq(dictionaryPacks.native, native),
              isNotNull(dictionaryPacks.publishedAt),
            ),
          ),
        db
          .select({ n: sql<number>`count(distinct ${lectures.slug})::int` })
          .from(lectures)
          .where(and(eq(lectures.language, target), eq(lectures.status, "published"))),
      ]);
      const check = canEnablePair({
        hasPublishedPack: (pack[0]?.n ?? 0) > 0,
        publishedLectures: lect[0]?.n ?? 0,
      });
      if (!check.ok) return c.json({ error: check.reason }, 409);
    }
    const row = await db.transaction(async (tx) => {
      const before = (
        await tx
          .select()
          .from(languages)
          .where(and(eq(languages.target, target), eq(languages.native, native)))
      )[0];
      const r = (
        await tx
          .insert(languages)
          .values({ target, native, enabled, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [languages.target, languages.native],
            set: { enabled, updatedAt: new Date() },
          })
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "languages", `${target}-${native}`, before ?? null, r);
      return r;
    });
    return c.json(row);
  });

  // ---------- feature flags ----------
  app.post("/flags", ADMIN, async (c) => {
    const patch = await body(
      c,
      z.object({
        key: z.string().min(1),
        enabled: z.boolean().optional(),
        percentage: z.number().optional(),
        users: z.array(z.string()).optional(),
      }),
    );
    const row = await db.transaction(async (tx) => {
      const before = (
        await tx.select().from(featureFlags).where(eq(featureFlags.key, patch.key))
      )[0];
      const merged = mergeFlag(
        before ? { ...before, users: before.users as string[] } : null,
        patch,
      );
      const r = (
        await tx
          .insert(featureFlags)
          .values({ ...merged, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: featureFlags.key,
            set: {
              enabled: merged.enabled,
              percentage: merged.percentage,
              users: merged.users,
              updatedAt: new Date(),
            },
          })
          .returning()
      )[0];
      await writeAudit(tx, actor(c), "feature_flags", patch.key, before ?? null, r);
      return r;
    });
    return c.json(row);
  });

  return app;
}
