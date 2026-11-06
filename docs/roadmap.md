# Roadmap

Living checklist. Tick a box when the goal is met in `main`, and add a dated note under the
phase for decisions, blockers and what was learned. Detailed reasoning for each phase is in
`review-2026-11-06.md`; how things work is in `developer-guide.md`.

Legend: `[x]` done · `[ ]` open · `[~]` in progress

## Phase 0 — learner surface (v0.3)

- [x] Onboarding with native and study language, consent, starter list, tour
- [x] Home: streak, minutes from reviews, lectures and stories, inbox, mute toggle
- [x] Karteikarten: lists, practice setup, four modes with ladder, summary with word drawer
- [x] Wörterbuch: pack v4 with curated glosses, worker search, add-to-list
- [x] Lektionen: 15 lectures + optional branch, word drawer, Lektionen list, widgets
- [x] Audio: core pack in the background, full pack opt-in, on-demand Piper, story clips
- [x] Admin: users, language parents, typed settings, content, legal, ops
- [x] CI green on `main`, release images published

Notes
- 2026-11-06: reviewed in hands-on rounds: Home, Karteikarten, Lektionen, Wörterbuch, Admin.
  Geschichten and Social are not reviewed.

## Phase 1 — login with email

- [ ] SMTP for GoTrue on the local stack (Inbucket) and a real sender for the server
- [ ] Sign-in screen in Profil: email → "Link gesendet" → signed in; sign-out
- [ ] Session persists across restarts (refresh token), no password anywhere
- [ ] Native: magic link opens the app via the custom scheme and exchanges the code (PKCE)
- [ ] Six-digit user tag on first sign-in (`users.tag`), shown in Profil; username editable
- [ ] Account export and deletion from the app
- [ ] Consent re-prompt still works when signed in

Notes
- Apple and Google sign-in come with the store builds (Phase 7). Apple sign-in is mandatory on
  iOS once any third-party login is offered.

## Phase 2 — stories review round

- [ ] Generation screen: progress states (writing, annotating, notes), error texts, retry
- [ ] Official stories cached offline; archive limits by tier; archive and unarchive
- [ ] Thumbs up or down per story stored with the usage row; visible in admin analytics
- [ ] Review pass on the reader like the other areas

Notes

## Phase 3 — profile sync

- [ ] Round trip on two devices: words, variants, lists, sentences, events, settings, stories,
      lecture and story progress, activity
- [ ] Regrades replay correctly on the second device; deleted lists tombstone
- [ ] Profile fields on the server: username, avatar, languages, streak summary, weekly minutes
- [ ] Sync status visible in Profil (last sync, pending events)

Notes

## Phase 4 — small social

- [ ] Tables `friendships` and `shared_items`, RLS
- [ ] API: find by tag, request, accept, decline, block, friends list with streak, badge,
      language and weekly minutes
- [ ] Share a list or story; import a shared item
- [ ] App: Freunde in Profil, requests in the inbox, "Teilen" in list and story menus
- [ ] Privacy: aggregated activity only, blocking both ways, profile visibility respected

Notes

## Phase 5 — Android APK

- [ ] Signed internal build from CI (keystore in secrets)
- [ ] Deep link for the magic link verified on a device
- [ ] Packs on the filesystem plugin instead of IndexedDB
- [ ] Sentry in the client
- [ ] Device test: fresh install → onboarding → core pack on cellular → offline session →
      sign-in → sync → story generation

Notes

## Phase 6 — deploy for the field test

- [ ] Server env complete (`PIPER_URL`, `NLP_URL`, database, JWT, service role, CORS, LLM, SMTP, Sentry)
- [ ] Pull agent ran once, `/health` green
- [ ] Dictionary v4 and audio core v4 published to the server's Supabase
- [ ] Admin seeded with the shipped lectures; first admin user with TOTP
- [ ] `billing.field_test = true`; testers invited by magic link
- [ ] Feedback channel for testers (inbox announcement or form)

Notes
- Payments are simulated during the field test: every purchase is granted, everyone is premium
  and supporter with free stories.

## Phase 7 — after the dry test

- [ ] RevenueCat SDK and store products; Stripe Checkout and Tax on web; supporter tip jar
- [ ] Apple and Google sign-in
- [ ] App Store and Play listings, screenshots, privacy labels
- [ ] English as a second native language; second study language

Notes

## Standing debts

- [ ] Gloss ranking in `build-pack` (needs the Wiktionary sources on a build machine)
- [ ] Coverage reporter in CI; tests for the audio install state machine and `spanish.ts`
- [ ] Clock hand snapping across 12; calendar starting at the lecture's example date
- [ ] CI check that the Drizzle schema matches the migrations
