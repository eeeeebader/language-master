# @lm/admin

Back office for Language Master: same stack as the app (Vite, React 19, TanStack Router/Query/
Table, Tailwind 4 with `@lm/ui` tokens), separate deploy at admin.languagemaster.app, behind
Traefik with an IP allow-list.

## Run

```bash
cp .env.example .env   # leave VITE_SUPABASE_URL empty for mock mode
pnpm --filter @lm/admin dev   # http://127.0.0.1:5174
```

Without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` the console runs in **mock mode** with
in-memory fixtures (banner in the sidebar); every module is usable and every write lands in the
mock audit log.

## Access

- Supabase auth (magic link); the role claim lives in `app_metadata.role` of the JWT:
  `admin | editor | analyst`. `src/lib/auth.ts` maps modules to roles; RLS must enforce the same.
- Admin accounts are created by hand; TOTP MFA is required (the sidebar flags sessions below AAL2).

## Reads and writes

Reads use supabase-js against the tables (`users`, `app_settings`, `legal_documents`, `changelog`,
`jobs`, `lectures`, `dictionary_packs`, `lemma_overrides`, `official_stories`, `languages`,
`llm_usage_daily` (view), `revenue` (view), `analytics` (view), `feature_flags`). Writes go through
the Hono API, which performs the change and the `audit_log` insert in one transaction.

## API contract (for apps/api)

Implemented in `apps/api/src/routes/admin.ts` (migration `0002_admin.sql` adds `changelog`,
`feature_flags`, `lemma_overrides`, `languages` and the three views). Notes on semantics:
`/admin/dictionary/build` and `/admin/lectures/:id/render-audio` create `jobs` rows with status
`queued` that the content-tools worker picks up; `/admin/jobs/:id/retry` re-runs retention in
process and re-queues everything else; `/admin/languages` returns 409 with a reason while the pair
is not ready.

All endpoints require `Authorization: Bearer <supabase access token>` with role `admin` (or
`editor` where noted) and respond with JSON. Every mutating endpoint writes
`audit_log(actor, table, row_id, before, after, at)`.

| Method | Path | Body | Role |
| --- | --- | --- | --- |
| GET | `/admin/audit?limit=200` | – | admin |
| POST | `/admin/users/:id/grant-tokens` | `{ delta: number, reason: string }` → token_ledger + entitlements | admin |
| POST | `/admin/users/:id/set-premium` | `{ is_premium: boolean }` | admin |
| GET | `/admin/users/:id/export` | – → full user data (Art. 15) | admin |
| POST | `/admin/users/:id/delete` | `{ reason }` → auth user delete, `deleted_accounts` row (Art. 17) | admin |
| POST | `/admin/settings` | `{ key, value_json }` → new version of app_settings | admin |
| POST | `/admin/legal` | `{ document, locale, markdown, requires_reconsent }` → new legal_documents version | admin, editor |
| POST | `/admin/changelog` | `{ version, locale, markdown }` | admin, editor |
| POST | `/admin/jobs/:id/retry` | `{}` | admin |
| POST | `/admin/lectures` | `{ content_json: Lecture }` → upsert draft (version + 1) | admin, editor |
| POST | `/admin/lectures/:id/publish` | `{}` | admin, editor |
| POST | `/admin/lectures/:id/render-audio` | `{}` → Piper job | admin, editor |
| POST | `/admin/dictionary/build` | `{ target, native }` → pack build job | admin, editor |
| POST | `/admin/dictionary/:id/publish` | `{}` → sets published_at, updates manifest | admin |
| POST | `/admin/dictionary/override` | `{ language, lemma, patch }` | admin, editor |
| POST | `/admin/stories/annotate` | `{ language, native, title, theme, text }` → StoryDocument (pipeline steps 4, 6, 7, 8; no quota, no writer call) | admin, editor |
| POST | `/admin/stories/publish` | `StoryDocument & { status }` | admin, editor |
| POST | `/admin/languages` | `{ target, native, enabled }` (API checks pack + ≥ 8 published lectures) | admin |
| POST | `/admin/flags` | `{ key, enabled?, percentage?, users? }` | admin |

Views the API/database workstream should provide for the light Finance/Analytics modules:
`llm_usage_daily(day, stories, cost_cents)`, `revenue(stripe_cents_30d, iap_cents_30d,
refunds_cents_30d, tokens_sold_30d, supporters_cents_30d)`, `analytics(dau, wau, funnel, story_success_rate, minutes_by_mode)`.
