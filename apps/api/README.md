# @lm/api

Hono on Node 22. LLM story pipeline, review-log sync, Stripe/RevenueCat webhooks, DSGVO export
and deletion, nightly retention cron, and migrations on start.

## Run

```bash
cp .env.example .env            # fill DATABASE_URL and SUPABASE_JWT_SECRET at least
pnpm --filter @lm/api dev       # http://localhost:8787
pnpm --filter @lm/api test
```

With the Supabase stack from `docker/` running locally, the defaults in `.env.example` match.

## Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | /health | – | liveness, migration state |
| POST | /sync/push | user JWT | append review events (idempotent on ulid), upsert LWW rows |
| GET | /sync/pull?since=ISO | user JWT | rows changed after the cursor |
| POST | /stories/generate | user JWT | quota gate → write → spaCy → notes → validate; token refunded on failure |
| POST | /webhooks/stripe | Stripe signature | premium, token packs, support |
| POST | /webhooks/revenuecat | shared secret | same, for App Store / Play |
| POST | /account/export | user JWT | DSGVO Art. 15 JSON export |
| DELETE | /account | user JWT | DSGVO Art. 17, immediate |

## Env vars

See `.env.example`. The LLM provider, model ids, prompt version, prices and daily limits are
read from `app_settings` (seeded by `pnpm --filter @lm/database seed`), so changing them is a
config change in the admin, not a release.

## Design notes

- Card state on the server is derived: after every event push the affected words are replayed
  with the same `@lm/srs` code the client uses, so both sides agree without a merge step.
- Overrides are new events with `supersedes`; replay skips superseded events.
- The quota gate debits a token in the same transaction that creates the story row; a failed
  pipeline writes a reverse ledger entry (`refund`), never an in-place update.
- All prompt inputs are enums and lemma lists; no learner free text reaches the model.
