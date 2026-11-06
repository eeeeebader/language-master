# Language Master

Offline-first language-learning app for the Stage 0 → A1/A2 phase: an FSRS-based Karteikarten
engine, a fully offline dictionary, a short lecture path and an interactive story reader with
colour-coded grammar. German native language, Spanish study language (v1).

The full product and technical plan lives in `docs/plan.md`.

## Status: v0.3 (learner surface reviewed, backend scaffolded, not yet deployed)

The client runs 100 % on the device and stays in local-only mode until the Supabase and API env
vars are set (`apps/client/.env.example`). The server side is complete as code and tested, and
has run against a local Supabase stack, but has never been deployed. Reviewed means the area has
been through a hands-on review round with real content and is considered finished for the field
test; everything else is listed with its gap.

| Area | State | Notes |
| --- | --- | --- |
| Onboarding | reviewed | name, native (de; en soon), study language (es; fr/it/pt/en/pl/uk/ja soon), consent, starter list, tour |
| Home | reviewed | streak, daily minutes from reviews + lectures + stories, next lecture, inbox, auto-speak mute |
| Karteikarten | reviewed | lists with level chips, practice setup (4 modes, direction, sample, focus, overview), ladder modes, grading panel, summary with word drawer |
| Wörterbuch | reviewed | pack v4 (46 731 headwords, curated glosses first), worker search, entry pages, add-to-list |
| Lektionen | reviewed | 15 lectures + optional branch, word drawer everywhere, "Lektionen" list, calculator/clock/calendar widgets |
| Audio | reviewed | core Opus pack installs in the background, full pack opt-in, on-demand Piper, story clips, auto-speak setting |
| Admin | reviewed | users (tier, supporter, free stories, tokens), languages with native parents, typed settings, content, legal, ops |
| Geschichten | **in progress** | reader and pipeline work; generation screen states, archive by tier and a quality loop are open; not yet reviewed like the areas above |
| Login & sync | **not reviewed** | magic link and sync routes exist; never exercised end to end against a live stack |
| Payments | **field-test mode only** | `billing.field_test` grants every purchase; Stripe/RevenueCat wiring exists but is untested |
| Social | **not started** | user tag, friends, shared lists and stories: design in `docs/review-2026-11-06.md` |
| Native builds | **not started** | Capacitor projects committed, no signed build yet |

See `docs/review-2026-11-06.md` for the detailed review and the roadmap, and
`docs/developer-guide.md` for how the pieces fit together when developing.

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
docs/                plan summary, developer guide, infrastructure docs, status review
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
pnpm content:validate          # lecture JSON against the schema and the pack
pnpm content:refine            # curated glosses on top of an existing dictionary pack
pnpm content:audio-pack        # core or full audio pack through Piper (needs ffmpeg)
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
