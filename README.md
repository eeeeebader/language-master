# Language Master

Offline-first language-learning app for the Stage 0 → A1/A2 phase: an FSRS-based Karteikarten
engine, a fully offline dictionary, a short lecture path and an interactive story reader with
colour-coded grammar. German native language, Spanish study language (v1).

The full product and technical plan lives in `docs/plan.md`.

## Status: v0.1 (local-only POC)

Everything in this version runs 100 % on the device. There is no backend, no account and no sync
yet; all data lives in IndexedDB on the device and can be exported or wiped from the profile page.

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
- **Dictionary**: hand-curated Spanish–German seed (~140 entries) with gender, plural, gender pairs,
  conjugations, IPA, examples; prefix + fuzzy + accent-insensitive search; variant picker on every
  form; custom entries.
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

Not in v0.1 (next): Supabase auth + sync of the event log, Hono API with the story pipeline
(LLM + spaCy), real dictionary packs from Wiktionary (SQLite), audio packs, local notifications,
payments, admin console, Capacitor native builds (config is in place).

## Repo layout

```
apps/client          Vite + React 19 + TanStack Router + Tailwind 4 + Dexie, Capacitor config
packages/schema      Zod 4 schemas: vocabulary, review events, lecture blocks, story document, settings
packages/srs         Pure TS: FSRS wrapper (ts-fsrs), event replay, reaction-time grading,
                     session planner, streak logic, mastery timeline — unit-tested
packages/content-tools  (placeholder) dictionary pack builder, lecture validator
docs/                product and technical plan
```

## Develop

```bash
corepack enable && pnpm install
pnpm dev          # client on http://127.0.0.1:5173
pnpm test         # vitest in all packages
pnpm typecheck
pnpm lint         # biome
pnpm build
```

Native shells: `pnpm --filter @lm/client exec cap add ios|android` then `pnpm --filter @lm/client cap:sync`.

## Design

Light mode only. Warm paper background `#FAF8F5`, five pastel accents that double as grammar
colours (sage = verb forms, rose = noun phrases, lavender = pronouns/references, amber = tense and
aspect, sky = connectors). Tokens live in `apps/client/src/styles.css`.

Dictionary data: Wiktionary, CC BY-SA 4.0 (the seed is hand-written against that licence model).
Legal texts in `apps/client/src/data/legal.ts` are drafts, not legal advice.
