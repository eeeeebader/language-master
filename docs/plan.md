# Language Master — product and technical plan (summary)

Source: "Language Master — Refined Product & Technical Plan", Nov 1 2026, Elias. This file keeps the
decisions that shape the build; the full document is the reference for scope, legal drafts and the roadmap.

## Decisions

- Spaced repetition runs on FSRS; reaction time is mapped onto its four grades (1 Easy … 4 Again).
- App client: Vite + React SPA packaged with Capacitor for web, iOS and Android. No SSR.
- Backend: self-hosted Supabase in Docker (Postgres, RLS, auth, storage), Drizzle, small Hono API;
  the same compose stack on the dev machine and the Linux server.
- Training data syncs as an append-only review log; card state is derived, so devices never conflict.
  Overrides are new events with `supersedes`; replay skips superseded events.
- Dictionaries ship as per-language SQLite packs built from Wiktionary (CC BY-SA 4.0), 100 % offline.
- Stories: LLM writes prose → spaCy annotates → second LLM pass writes grammar notes → Zod validates.
  No free-text prompts (prompt injection). Tolerant checks; one retry, then the token is refunded.
- Payments: RevenueCat (Apple/Google IAP) on mobile, Stripe + Stripe Tax on web; support payments web-only.
- Users confirm they are 16 or older; under-16s are refused; no exact age is stored.
- Light mode only. Warm paper background with five pastel accents that double as grammar colours.
- Native languages German and English (English content later); study language Spanish first,
  the admin can prepare pairs for fr, it, pt, en, pl, uk, ja. Everything localisable.

## Tiers

| Tier | Includes | Price |
| --- | --- | --- |
| Free | all learning features for one active language, 1 free AI story/day, 2 active stories | 0 € |
| Premium (one-time) | 5 languages, 50-story archive per language, 25 tokens | 12.99 € |
| Token packs | 10 / 50 story tokens | 2.99 € / 9.99 € |
| Support | tip jar, web only, supporter badge | optional |

## Streak rules

Learner picks learning days (default Mon–Fri). Only a learning day without learning breaks the
streak. Vacation pauses it. Reactivation with one tap while ≤ 5 learning days were missed, no cost.
The count is the number of days actually learned. Learning = any review, a finished lecture, or a
story read to the end.

## Karteikarten engine

Reaction-time threshold = base (1.5 s, self-calibrated from the median of the last 50 reviews)
+ 0.09 s × characters; <1× Easy, <2× Good, <4× Hard, else Again. Per-word response profile per
prompt type (EMA, α = 0.3); after 3 measurements the profile grades: <0.8× Easy, ≤1.2× Good,
≤2× Hard. Again → 5-minute retry, Hard → 10-minute retry. Retry buffer ≤ 10; three Agains in a
session skip the word for today. One-tap override rewrites the review.

Modes: 1 classic (manual), 2 reaction-time (auto + override), 3 progressive choice → typing
(auto), 4 Learn Forever (due queue, then new at a daily rate; auto + override).

## Roadmap (phases, revised 6 Nov 2026)

1. Karteikarten, dictionary, lectures, audio, admin — done and reviewed (v0.3)
2. Login with email (SMTP), user tag
3. Stories review round
4. Profile sync on two devices
5. Small social: friends by tag, progress, shared lists and stories
6. Android APK, then deploy for the field test with `billing.field_test` instead of payments
7. After the dry test: RevenueCat, Stripe, store listings

## Open decisions

Product name / trademark check; legal form; LLM provider and DPA; second language pair
(French or Italian); Piper voice licence; analytics (PostHog EU vs Umami).
