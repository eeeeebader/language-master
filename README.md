# Language Master

Offline-first language-learning app for the Stage 0 → A1/A2 phase: an FSRS-based Karteikarten
engine, a fully offline dictionary, a short lecture path and an interactive story reader with
colour-coded grammar. German native language, Spanish study language (v1).

The full product and technical plan lives in `docs/plan.md`.

## Status: v0.2 (client POC + full infrastructure scaffold)

The client runs 100 % on the device and stays in local-only mode until the Supabase and API env
vars are set (`apps/client/.env.example`). With them set it signs in by magic link and syncs the
append-only review log through the API. The whole server side from the plan is scaffolded and
validated (typecheck, tests, compose config) but not yet deployed or exercised against a live
Supabase stack.

What works:

- **Onboarding**: username → languages → "16 or older" + AGB/Datenschutz consent → guided starter
  session on a system list of survival words → skippable tab tour.
- **Home**: streak (learning days, vacation, one-tap reactivation), due cards, continue story,
  next lecture, mastered words, words read in stories, daily minutes, 12-week velocity chart.
- **Karteikarten**: lists (system + custom), one canonical word per lemma, card variants
  (lemma / article / plural / conjugation / gender pair / custom), session assembly across lists
  with due / failed / new filters, random sampling and direction, and all four modes:
  classic, reaction-time, progressive (choice → typing) and Learn Forever. Reaction-time grading
  with self-calibrating base, per-word response profiles (EMA), one-tap override via superseding
  events, 5/10-minute retry loops, the 10-card cognitive-load cap and skip-after-three-Agains.
- **Dictionary**: a downloadable Spanish–German pack (WikDict translations, German-Wiktionary
  glosses, English-Wiktionary morphology, subtitle frequency ranks, curated A1 overrides; ~46 700
  lemmas plus ~4 000 inflected forms, 21.6 MB) checked
  against a manifest on launch, stored on the device and queried with sql.js; the bundled ~140-entry
  seed is the fallback. Prefix + fuzzy + accent-insensitive search; variant picker on every form;
  custom entries. An optional audio pack (Piper voice, MP3, ~4 600 clips for headwords, forms and
  lecture texts, 24 MB) is downloaded from settings and played before the device's TTS.
- **Lectures**: Spanish unit 0 as twelve nodes on an SVG path, rendered from the typed block schema
  (alphabet grid, number table, rule cards, pattern builder, conjugation mini, dialogue, compare,
  constraint visual, quick check, vocab bundle). Soft locks; "Got it" or the quick check marks a node done.
- **Stories**: two official texts rendered by the generic reader: five-colour grammar spans with
  cross-sentence references, word drawer (contextual + literal gloss, grammar note, sentence, add to
  list with the story sentence as context), coverage bar, post-story vocabulary summary with bulk-add
  and "test story vocabulary" (Mode 3). The generation controls are built; generation itself needs
  the API and is disabled.
- **Profile / settings**: avatar, member since, language stats, activity calendar, sound, haptics,
  daily new cards, streak settings, FAQ, legal drafts, JSON export, delete everything.

Server side and tooling (v0.2, scaffolded):

- **apps/api**: Hono on Node 22. Sync push/pull, story pipeline (quota gate → LLM writer →
  spaCy annotate → LLM grammar notes → Zod validation, tolerant checks, one retry, refund),
  Stripe and RevenueCat webhooks → entitlements, account export/delete, nightly retention cron,
  migrations with advisory lock. Golden tests with a recorded fake LLM.
- **packages/database**: Drizzle schema for every table in the plan, hand-written initial
  migration, RLS policies, app_settings seed.
- **apps/nlp**: FastAPI + spaCy `es_core_news_md`, `/annotate` in the StoryToken shape.
- **apps/admin**: back office (Users, Limits, Legal, Changelog, Jobs, Audit, Content: lectures with
  live preview, dictionary, official stories, Languages, Finance, Analytics, Flags) with a mock mode
  when no Supabase env is set. Its README defines the `/admin/*` API contract the API still has to implement.
- **apps/site**: Astro marketing site + VitePress docs (architecture, offline data model, pipeline,
  packs, lectures, admin, legal).
- **packages/ui**, **packages/i18n**, **packages/content-tools**: design tokens and pure lecture
  components; i18next catalog with a CI key check; Kaikki → SQLite pack builder (FTS5, `node:sqlite`),
  dict client, lecture validator, Piper audio renderer.
- **infra/ + docker/**: official self-hosted Supabase (pinned), Traefik v3 stack for api/nlp/piper/
  static sites/listmonk, key generator, backup/restore and pull-deploy scripts with systemd timers.
- **.github/workflows**: CI (lint, typecheck, test, build, NLP tests, compose checks), GHCR image
  release on main, Capacitor mobile builds on tags (gated on secrets).

- **Notifications**: a pure planner in `packages/srs` (streak deadline minus one hour, study
  reminders skipped on practised days, weekly summary recomputed from local data, due-card
  projection, free story, lecture nudge, quiet hours) scheduled through Capacitor local
  notifications on iOS/Android; the settings page edits every type and previews the plan. The
  OS permission is requested after the first finished session. An in-app inbox shows changelog,
  legal updates and announcements with an unread badge on Home.

- **Versioned consent**: the API serves the current legal texts and records consents per
  (user, document, version); a new AGB or Datenschutz version published with the re-consent flag
  blocks the signed-in app until accepted, the onboarding consent is carried over when versions
  match, and the legal pages show the served version.

- **Observability**: Sentry (EU DSN) in client, admin and API with source maps uploaded on CI
  builds, and PostHog Cloud EU product analytics with typed events (`packages/schema/src/events.ts`),
  pseudonymous ids, no session recording and an in-app opt-out. All inert without keys.

- **Web offline**: a service worker precaches the whole bundle (routes, SQLite wasm), so the web
  app reloads and navigates offline; packs and audio live in IndexedDB.
- **Playwright smoke tests** (`pnpm --filter @lm/client e2e`, against the built bundle in
  local-only mode): onboarding and starter session, dashboard, dictionary search and add-to-list,
  reaction-time and progressive sessions, lecture with quick check, reader drawer and vocabulary
  summary, and an offline reload plus session. Run in CI.

- **Monitoring**: Prometheus metrics from the API (`/metrics`: request latency by route, sync push
  latency, story generations by result, LLM cost, pack manifest requests and client-reported pack
  download failures), a blackbox uptime probe, Loki/Promtail logs and a provisioned Grafana
  dashboard (`docker/docker-compose.monitoring.yml`, `make monitoring-dev` locally on
  http://localhost:3300). Alert rules for API down, app shell down, story failure rate and slow sync.

Still open: store configuration (RevenueCat products, signing), store releases, and alert delivery
(Alertmanager or Grafana contact points).

## Repo layout

```
apps/client          Vite + React 19 + TanStack Router + Tailwind 4 + Dexie, Capacitor config
apps/admin           Vite + React admin console
apps/api             Hono API: sync, story pipeline, webhooks, cron, migrations
apps/nlp             Python FastAPI + spaCy
apps/site            Astro marketing site + VitePress docs
packages/schema      Zod 4 schemas shared by everything
packages/srs         FSRS wrapper, replay, grading, session planner, streak (pure TS, tested)
packages/database    Drizzle schema, migrations, RLS, seeds
packages/ui          design tokens, pure lecture components, sound sprite manifest
packages/i18n        i18next catalogs (de) + key check
packages/content-tools  dictionary pack builder, dict client, lecture validator, audio renderer
docker/              Traefik stack for everything that is not Supabase
infra/               self-hosted Supabase, scripts (keys, backup, deploy), systemd units
docs/                plan summary and infrastructure docs
```

## Develop

```bash
corepack enable && pnpm install
pnpm dev          # client on http://127.0.0.1:5173
pnpm dev:admin    # admin on http://127.0.0.1:5174 (mock mode without env)
pnpm dev:api      # API (needs DATABASE_URL etc., see apps/api/.env.example)
pnpm dev:site
pnpm test         # vitest in all packages + i18n key check
pnpm --filter @lm/client e2e   # Playwright smoke tests (builds and previews the client)
pnpm typecheck
pnpm lint         # biome
pnpm build
make keys         # generate Supabase JWT secret + anon/service keys
make supabase-up  # self-hosted Supabase (infra/supabase/.env required)
make stack-dev    # Traefik + api + nlp + piper locally
make check        # validate all compose files
```

See `docs/infra.md` for the production topology and deploy flow.

## Local stack (sign-in, sync, story generation)

```bash
make keys > /tmp/keys.env                      # Supabase secrets
cp infra/supabase/.env.example infra/supabase/.env   # paste the keys, set KONG_HTTP_PORT=8100, SITE_URL=http://localhost:5173, SMTP_HOST=mail
cd infra/supabase && docker compose --env-file .env -f docker-compose.yml -f docker-compose.local.yml up -d
docker build -t lm-nlp:dev apps/nlp && docker run -d --name lm-nlp-dev -p 127.0.0.1:8001:8080 lm-nlp:dev
cp apps/api/.env.example apps/api/.env         # DATABASE_URL via the pooler on 55432, JWT secret, NLP_URL, LLM keys
cp apps/client/.env.example apps/client/.env.local   # VITE_SUPABASE_URL=http://localhost:8100, anon key, VITE_API_URL=http://localhost:8787
pnpm dev:api && pnpm dev
```

`docker-compose.local.yml` prefixes container names and remaps ports so the stack can run next to
another Supabase on the same machine, and adds Inbucket on http://localhost:9100 for magic-link
mails. `LLM_PROVIDER=fake` runs the whole story pipeline deterministically without an API key.

## Native apps

The Capacitor projects live in `apps/client/android` and `apps/client/ios` (committed; regenerate
icons with `pnpm exec capacitor-assets generate` from `apps/client/assets`). After every web build:

```bash
pnpm --filter @lm/client build && pnpm --filter @lm/client exec cap sync
cd apps/client/android && ./gradlew assembleDebug      # needs JDK 21 + Android SDK, or use the Docker build below
docker run --rm -v "$PWD/apps/client/android:/project" -w /project mingc/android-build-box:latest ./gradlew assembleDebug
```

iOS builds need Xcode on macOS (`cd apps/client/ios/App && xcodebuild` or the Fastlane lane in
`.github/workflows/mobile.yml`). The workflow also publishes a debug APK artifact on every tag.

Native specifics: magic links open the app via the `app.languagemaster.client://auth/callback`
scheme (PKCE), purchases go through RevenueCat with product ids `premium_unlock`,
`story_tokens_10`, `story_tokens_50` (set `VITE_REVENUECAT_IOS_KEY` / `VITE_REVENUECAT_ANDROID_KEY`
at build time), and reminders are Capacitor local notifications.

## Design

Light mode only. Warm paper background `#FAF8F5`, five pastel accents that double as grammar
colours (sage = verb forms, rose = noun phrases, lavender = pronouns/references, amber = tense and
aspect, sky = connectors). Tokens live in `apps/client/src/styles.css`.

Dictionary data: Wiktionary, CC BY-SA 4.0 (the seed is hand-written against that licence model).
Legal texts in `apps/client/src/data/legal.ts` are drafts, not legal advice.
