# Developer guide

How the pieces fit together, where data lives, and how to change the things that change most:
content, packs, audio and the schema. Infrastructure and hosting are in `infra.md`; the product
decisions in `plan.md`; the current status and roadmap in `review-2026-11-06.md`.

## First run

```bash
corepack enable && pnpm install
pnpm dev                     # client, local-only mode, http://127.0.0.1:5173
```

Local-only means no account, no sync, no story generation; everything else works. The client
seeds a 150-entry dictionary and the bundled lectures and official stories, then installs the
real dictionary pack and the core audio pack from the manifest as soon as a server is configured.

For sign-in, sync and stories, bring up the local stack (Supabase, NLP, Piper, API) as described
in the README section "Local stack". `LLM_PROVIDER=fake` keeps the story pipeline deterministic
and free. Dev servers for the Claude Code browser pane are in `.claude/launch.json` (`client`,
`api`, `admin`).

## Monorepo map

| Package | Role | Tests |
| --- | --- | --- |
| `packages/schema` | Zod types shared by everything: vocabulary, review events, settings, lectures, stories | validated indirectly |
| `packages/srs` | FSRS wrapper, grading from reaction time, session planner with ladder steps, streak, notifications; pure TS | 46 |
| `packages/content-tools` | dictionary pack build and refine, dictionary client over SQLite, lecture validation, audio pack build | 9 |
| `packages/database` | Drizzle schema, SQL migrations `0000…`, RLS, app-settings defaults | – |
| `packages/ui` | pure lecture block renderer used by the admin preview, design tokens | – |
| `apps/client` | the app: Vite, React 19, TanStack Router (file routes, generated route tree), Tailwind 4, Dexie 4, Capacitor | 9 unit, 8 e2e |
| `apps/api` | Hono: sync, stories, billing, packs, admin, webhooks, cron, migrations on boot | 25 |
| `apps/admin` | back office; mock mode without env | – |
| `apps/nlp` | FastAPI + spaCy annotation | pytest |
| `apps/site` | Astro site + VitePress docs | – |

## Client data model (Dexie, `apps/client/src/db/db.ts`)

- `words`: one canonical word per (language, lemma) with translation, pos, dictionaryRef.
- `variants`: what is actually practised: lemma, article, plural, gender_pair, conjugation,
  custom; each has `front` (Spanish) and `back` (German).
- `lists`, `listWords`: user lists, system list "Erste Wörter", the "Lektionen" list.
- `events`: immutable review events (grade, reactionMs, mode, `supersedes` for regrades).
- `cardStates`: derived FSRS state per variant, recomputed by replay; `profiles`: reaction-time
  profiles per variant and prompt kind.
- `sentences`: example sentences per word (dictionary, story, own).
- `stories`, `storyProgress`, `lectureProgress`, `activity` (per day: reviews, lecturesDone,
  storiesRead, minutes), `streakLog`, `settings` (single row "me"), `inbox`.
- `packFiles` (the dictionary SQLite as bytes), `audioClips` (key = exact text, Opus bytes).

Rules: never mutate an event, write a new one with `supersedes`. Never store derived state as
truth; `recordReview` in `db/repo.ts` appends the event and updates the caches. Every schema
change is a new `this.version(n)` with an `upgrade`.

Practice sessions: `lib/session-builder.ts` turns lists and filters into `SessionCard`s (one card
per word and translation; direction per card), `@lm/srs` `session.ts` plans the order, retries
and ladder steps, and `routes/karteikarten.session.tsx` renders the stages
`front → revealed → result → overview → done`.

## Content

Lectures are TypeScript data in `apps/client/src/data/lectures-es.ts` (Zod-validated in
`test/content.test.ts`). Blocks: heading, prose (minimal markdown: bold, italic, bullets),
alphabet_grid, number_table, word_list, rule_card, pattern_builder (options may carry a
translation), conjugation_mini, dialogue, compare (rows may carry a translation, cells can open
the word drawer), constraint_visual, quick_check, vocab_bundle (lemmas with translations plus
phrases), calculator, clock, calendar. Every Spanish word rendered through `Word`, a word list,
a compare cell or a vocab chip opens `VocabSheet`, the generic word drawer.

Adding a lecture: append to `LECTURES_ES` (order = path order; `side: true` for an optional
branch hanging off `requires[0]`), run `pnpm --filter @lm/client test`, then rebuild the core
audio pack so its texts are voiced. Bundle lemmas should be `v("lemma", "German")` so the card
gets a curated translation; phrases outside the dictionary go into `phrases`.

Official stories: `apps/client/src/data/stories-es.ts` (tokens with lemma, pos, gloss; grammar
spans). Generated stories come from the API and ship with their audio clips.

Seed dictionary: `apps/client/src/data/dictionary-es.ts`, the offline fallback and the source of
curated glosses that win over the pack.

## Packs and audio

- Dictionary pack: `pnpm content:pack` from Kaikki + WikDict + frequency list (sources not in the
  repo). `pnpm content:refine --pack dist/es-de.vN.sqlite --version N+1 --seed … --lectures …`
  lays the curated glosses on top of an existing pack and updates the search index.
- Audio packs: `pnpm content:audio-pack --tier core|full` renders through Piper (`PIPER_URL`),
  encodes Opus with ffmpeg, keys clips by exact text. Core = top 6 000 lemmas + lectures +
  official stories (~37 MB), installed for everyone in the background; full = every headword,
  opt-in in settings.
- Publish: `node infra/scripts/publish-pack.mjs --file … --manifest … --publish` uploads to the
  Supabase bucket `packs` and registers the row; `/packs/manifest` serves the newest published
  dictionary, core and full audio packs. The app updates by checksum.
- On demand: `GET /packs/tts?text=` renders anything a pack does not cover; the client caches
  the clip in `audioClips`.

## API conventions

- `apps/api/src/routes/*` are Hono routers mounted in `app.ts`; public routes (`/health`,
  `/packs`, `/legal`, `/stories/official`, `/webhooks`) come before `requireUser`.
- Settings live in `app_settings` (defaults in `packages/database/src/defaults.ts`), read
  through `SettingsStore` with a 30 s cache. Add a key to the defaults, to the admin `META` in
  `apps/admin/src/routes/limits.tsx` and to the admin mock.
- Admin writes go through `/admin/*` and insert an `audit_log` row; the contract table is in
  `apps/admin/README.md`.
- Migrations: add a new numbered file in `packages/database/migrations`, never edit an applied
  one; the API applies them on boot. Update `schema.ts` alongside.
- `billing.field_test = true` makes every purchase succeed and every user premium + supporter
  with free stories; use it for dry tests only.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test   # what CI runs, plus pnpm -r build
pnpm --filter @lm/client e2e               # Playwright against a preview build
```

Biome formats on `--write`; keep the lockfile frozen-installable (`pnpm install --frozen-lockfile`).
Build scripts of dependencies must be allowed or denied in `pnpm-workspace.yaml` (`allowBuilds`).
