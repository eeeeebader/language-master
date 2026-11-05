import { mock } from "./mock";
import { API_URL, supabase } from "./supabase";

/**
 * Data layer. Reads go through supabase-js (RLS enforces the role claim), writes that need
 * secrets or an audit entry go through the Hono API (contract in README.md). In mock mode
 * everything is served from in-memory fixtures.
 */

type Table = keyof typeof mock;

export async function list<T = Record<string, unknown>>(
  table: Table,
  opts: { search?: string; column?: string } = {},
): Promise<T[]> {
  if (!supabase) {
    const rows = mock[table] as unknown as T[];
    if (!Array.isArray(rows)) return [];
    if (!opts.search) return rows;
    const q = opts.search.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }
  let query = supabase.from(table).select("*");
  if (opts.search && opts.column) query = query.ilike(opts.column, `%${opts.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data as T[];
}

export async function single<T>(table: Table): Promise<T> {
  if (!supabase) return mock[table] as unknown as T;
  const { data, error } = await supabase.from(table).select("*").single();
  if (error) throw error;
  return data as T;
}

let token = "mock";
export function setToken(t: string) {
  token = t;
}

/** POST to the API; the API writes the row and the audit_log entry in one transaction. */
export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  if (!supabase) return mockWrite(path, body) as T;
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  if (!supabase) return mockRead(path) as T;
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

function audit(table: string, rowId: string, before: unknown, after: unknown) {
  mock.audit_log.unshift({
    actor: "admin (mock)",
    table,
    row_id: rowId,
    before,
    after,
    at: new Date().toISOString(),
  });
}

function mockRead(path: string): unknown {
  if (path.startsWith("/admin/users/") && path.endsWith("/export")) {
    const id = path.split("/")[3];
    return {
      user: mock.users.find((u) => u.id === id),
      lists: [],
      words: [],
      review_events: [],
      stories: [],
    };
  }
  if (path === "/admin/audit") return mock.audit_log;
  if (path === "/admin/ops") return mock.ops;
  return null;
}

// biome-ignore lint/suspicious/noExplicitAny: mock store is untyped by design
function mockWrite(path: string, body: any): unknown {
  const now = new Date().toISOString();
  const [, , mod, id, action] = path.split("/");
  switch (mod) {
    case "users": {
      const u = mock.users.find((x) => x.id === id);
      if (!u) throw new Error("user not found");
      const before = { ...u };
      if (action === "grant-tokens") u.story_tokens += Number(body.delta);
      if (action === "set-premium") u.is_premium = !!body.is_premium;
      if (action === "delete") mock.users.splice(mock.users.indexOf(u), 1);
      audit("users", u.id, before, action === "delete" ? null : { ...u });
      return u;
    }
    case "settings": {
      const s = mock.app_settings.find((x) => x.key === body.key);
      const before = s ? { ...s } : null;
      if (s) {
        s.value_json = body.value_json;
        s.version += 1;
        s.updated_at = now;
        s.updated_by = "admin (mock)";
      } else
        mock.app_settings.push({
          key: body.key,
          value_json: body.value_json,
          version: 1,
          updated_by: "admin (mock)",
          updated_at: now,
        });
      audit(
        "app_settings",
        body.key,
        before,
        mock.app_settings.find((x) => x.key === body.key),
      );
      return mock.app_settings;
    }
    case "legal": {
      const prev = mock.legal_documents
        .filter((d) => d.document === body.document && d.locale === body.locale)
        .sort((a, b) => b.version - a.version)[0];
      const row = {
        id: `l${Date.now()}`,
        document: body.document,
        locale: body.locale,
        version: (prev?.version ?? 0) + 1,
        markdown: body.markdown,
        published_at: now,
        requires_reconsent: !!body.requires_reconsent,
      };
      mock.legal_documents.push(row);
      audit("legal_documents", row.id, null, row);
      return row;
    }
    case "changelog": {
      const row = {
        id: `c${Date.now()}`,
        version: body.version,
        locale: body.locale ?? "de",
        markdown: body.markdown,
        published_at: now,
      };
      mock.changelog.unshift(row);
      audit("changelog", row.id, null, row);
      return row;
    }
    case "jobs": {
      const j = mock.jobs.find((x) => x.id === id);
      if (j) {
        const before = { ...j };
        j.status = "ok";
        j.finished_at = now;
        j.summary = `retried: ${j.summary}`;
        audit("jobs", j.id, before, { ...j });
      }
      return j;
    }
    case "lectures": {
      if (action === "publish") {
        const l = mock.lectures.find((x) => x.id === id);
        if (l) {
          const before = { ...l };
          l.status = "published";
          audit("lectures", l.id, before, { ...l });
        }
        return l;
      }
      const existing = mock.lectures.find((x) => x.id === body.content_json.id);
      const before = existing ? { ...existing } : null;
      if (existing) {
        existing.content_json = body.content_json;
        existing.version += 1;
        existing.status = "draft";
        existing.title = body.content_json.title?.de ?? existing.title;
      } else
        mock.lectures.push({
          id: body.content_json.id,
          language: body.content_json.language,
          slug: body.content_json.slug,
          version: 1,
          status: "draft",
          sort_order: mock.lectures.length + 1,
          title: body.content_json.title?.de ?? "",
          content_json: body.content_json,
        });
      audit(
        "lectures",
        body.content_json.id,
        before,
        mock.lectures.find((x) => x.id === body.content_json.id),
      );
      return body.content_json;
    }
    case "dictionary": {
      if (action === "build") {
        const job = {
          id: `j${Date.now()}`,
          name: `pack_build:${body.target}-${body.native}`,
          started_at: now,
          finished_at: null as string | null,
          status: "running",
          summary: "queued",
        };
        mock.jobs.unshift(job as never);
        audit("jobs", job.id, null, job);
        return job;
      }
      if (action === "publish") {
        const p = mock.dictionary_packs.find((x) => x.id === id);
        if (p) {
          p.published_at = now;
          audit("dictionary_packs", p.id, null, p);
        }
        return p;
      }
      const row = {
        id: `o${Date.now()}`,
        language: body.language,
        lemma: body.lemma,
        patch: body.patch,
        updated_by: "editor (mock)",
        updated_at: now,
      };
      mock.lemma_overrides.unshift(row);
      audit("lemma_overrides", row.id, null, row);
      return row;
    }
    case "stories": {
      if (action === "annotate") {
        const sentences = String(body.text)
          .split(/(?<=[.!?])\s+/)
          .filter(Boolean);
        return {
          id: `es-official-${Date.now()}`,
          language: body.language,
          native: "de",
          title: body.title,
          theme: body.theme,
          level: 1,
          source: "official",
          createdAt: now,
          paragraphs: [
            sentences.map((s: string, i: number) => ({
              id: `s${i}`,
              translation: "(Übersetzung folgt aus dem Pipeline-Schritt)",
              tokens: s.split(/\s+/).map((w: string) => ({
                text: w,
                lemma: w.toLowerCase().replace(/[^\p{L}]/gu, ""),
                pos: "other",
                ws: " ",
                isWord: true,
              })),
            })),
          ],
          spans: [],
        };
      }
      const row = {
        id: body.id,
        language: body.language,
        title: body.title,
        theme: body.theme,
        status: "published",
        published_at: now,
      };
      mock.official_stories.unshift(row);
      audit("stories", row.id, null, row);
      return row;
    }
    case "languages": {
      const l = mock.languages.find((x) => x.target === body.target && x.native === body.native);
      if (l) {
        const before = { ...l };
        l.enabled = !!body.enabled;
        audit("languages", `${l.target}-${l.native}`, before, { ...l });
      }
      return l;
    }
    case "flags": {
      const f = mock.feature_flags.find((x) => x.key === body.key);
      const before = f ? { ...f } : null;
      if (f) Object.assign(f, body);
      else
        mock.feature_flags.push({
          key: body.key,
          percentage: body.percentage ?? 0,
          users: body.users ?? [],
          enabled: !!body.enabled,
        });
      audit(
        "feature_flags",
        body.key,
        before,
        mock.feature_flags.find((x) => x.key === body.key),
      );
      return mock.feature_flags;
    }
    default:
      throw new Error(`mock: unknown path ${path}`);
  }
}
