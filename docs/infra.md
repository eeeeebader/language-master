# Infrastructure

One Hetzner CX32 (4 vCPU, 8 GB, Ubuntu 24.04) runs everything except the stores and the
managed SaaS pieces (PostHog EU, Sentry EU, RevenueCat, Stripe). Two compose projects share
one Docker network:

```
                 Internet
                    │ :80 → :443 (redirect)
              ┌─────▼─────┐   Let's Encrypt (http-01), rate limits, IP allow-list for admin/Studio
              │  traefik   │   docker/traefik/{traefik,dynamic}.yml
              └─┬──┬──┬──┬─┘
  app.<d>  ─────┘  │  │  └───── db.<d>  → kong (Supabase REST/Auth/Storage/Studio)
  admin.<d> ───────┘  └──────── api.<d> → api (Hono, Node 22)
  <d>, www., docs.  → site (Astro + VitePress, nginx)
  news.<d> (profile v2) → listmonk

  lm-internal (no egress):  api ⇄ nlp (FastAPI + spaCy)   api ⇄ piper (TTS)   listmonk ⇄ listmonk-db
  lm-supabase_default:      api ⇄ kong / db (Postgres 15/17, GoTrue, PostgREST, Storage, Realtime, Studio)
```

| Project | Files | Contents |
| --- | --- | --- |
| `lm-supabase` | `infra/supabase/` (upstream `docker/` at the tag in `VERSION`) | Postgres, Kong, GoTrue, PostgREST, Storage, Realtime, Studio, Logflare/Vector, pooler |
| `lm` | `docker/docker-compose.yml` (+ `docker-compose.dev.yml`) | traefik, api, nlp, piper, client, admin, site, listmonk (profile `v2`) |

Static apps are nginx containers that copy the built `dist/` (client/admin: SPA fallback; site:
plain static + `/docs`). Images are built in CI and published to GHCR; the server never builds.

## Environments

| | Local dev | Server |
| --- | --- | --- |
| Supabase | `make supabase-up`, Studio `http://localhost:8000` | same stack, published as `db.<domain>` |
| App stack | `pnpm dev` (client on 5173, api on 3000) or `make stack-dev` | `make stack-up`, rolled by the pull agent |
| TLS | none | Let's Encrypt via traefik |
| Env files | `infra/supabase/.env`, `docker/.env`, `apps/*/.env` | `/opt/language-master/{infra/supabase,docker}/.env` |

The client decides at launch whether a backend exists (`VITE_SUPABASE_URL` set) and otherwise
stays local-only, which is the v0.1 behaviour.

## Secrets

Generated once with `make keys` and kept only in the env files on the server (and a password
manager). Never in git, never in CI logs.

| Name | Where | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_*`, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `LOGFLARE_*` | `infra/supabase/.env` | Supabase |
| `SMTP_*` | `infra/supabase/.env` | magic-link mail (GoTrue) |
| `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | `docker/.env` | API ↔ Supabase |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | `docker/.env` | story pipeline (provider switch in admin settings) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_SECRET` | `docker/.env` | entitlements webhooks |
| `SENTRY_DSN`, `POSTHOG_KEY` | `docker/.env`, client/admin build env | observability |
| `LISTMONK_*` | `docker/.env` | newsletter (v2) |
| `GHCR_USER`, `GHCR_TOKEN` (read:packages) | `/etc/language-master/deploy.env` | pull agent |
| `BACKUP_TARGET`, storage-box SSH key | `/etc/language-master/backup.env`, `~/.ssh` | backups |
| App Store Connect API key, match repo, Android keystore, Play service account | GitHub Actions secrets | `mobile.yml` (enabled with repo var `MOBILE_SECRETS_READY=true`) |

## Deploy flow

1. PR → `ci.yml`: Biome, typecheck, Vitest, builds, NLP pytest, compose config checks.
2. Merge to `main` → `release.yml` builds `api`, `nlp`, `piper`, `client`, `admin`, `site` images
   and pushes `ghcr.io/<owner>/language-master-*:latest` (+ `sha-…` tags).
3. The server pull agent (`infra/scripts/pull-deploy.sh` via `infra/systemd/lm-deploy.timer`,
   every 3 min) logs in to GHCR with a read-only token, pulls, and `docker compose up -d` only
   when an image changed. No inbound SSH from CI. Drizzle migrations run inside the api
   container on start under an advisory lock, so a new api image migrates before it serves.
4. Tag `v*` → `mobile.yml`: Capacitor iOS build to TestFlight (Fastlane, macOS runner) and
   Android AAB to the Play internal track; store releases are promoted by hand.
5. Rollback: `IMAGE_TAG=sha-<old>` in `docker/.env`, then `make stack-up`.

### Server bootstrap (once)

```bash
# as root on the CX32
apt-get install -y docker.io docker-compose-v2 git
git clone https://github.com/<owner>/language-master /opt/language-master
cd /opt/language-master
cp infra/supabase/.env.example infra/supabase/.env && node infra/scripts/gen-keys.mjs >> infra/supabase/.env
cp docker/.env.example docker/.env            # fill DOMAIN, ACME_EMAIL, GHCR_OWNER, allow-list, secrets
mkdir -p /etc/language-master && cp infra/systemd/*.env.example /etc/language-master/   # rename, fill
cp infra/systemd/lm-*.{service,timer} /etc/systemd/system/ && systemctl enable --now lm-deploy.timer lm-backup.timer
make supabase-up && make stack-up
```

DNS: `A` records for `<d>`, `www`, `app`, `admin`, `api`, `db`, `docs`, `news` → the server IP.

## Backups and restore

- Nightly 02:30 UTC: `infra/scripts/backup.sh` dumps Postgres (`pg_dump --clean --if-exists`),
  gzips, rsyncs to the Hetzner Storage Box, prunes local copies after 30 days.
- Restore: `make restore FILE=infra/supabase/backups/lm-<stamp>.sql.gz` (interactive confirm).
- Supabase Storage objects (`infra/supabase/volumes/storage`) and `letsencrypt` certs are bind /
  named volumes; add them to the rsync if you want them off-box (packs and audio are rebuildable
  from the repo, so they are not required).
- Test a restore on the dev machine after every Supabase version bump.

## Observability

- Sentry (EU) in client, admin and api with source maps per release.
- Hono logs to stdout → `docker logs` (json-file, rotated 5×20 MB); Loki/Grafana optional later.
- Uptime: external check on `https://api.<d>/health` and `https://app.<d>/health`.
- Traefik access log on stdout; `ratelimit-llm` protects `/stories` on the API.

## Sizing notes

spaCy `es_core_news_md` ≈ 500 MB RSS with 2 uvicorn workers; Supabase ≈ 2.5 GB; Postgres
tuned by upstream defaults. The CX32 has headroom for Listmonk (v2) and Piper batch renders.
Scale by moving Supabase to a second box: only `DATABASE_URL`/`SUPABASE_URL` and the external
network change.

## Monitoring

`docker/docker-compose.monitoring.yml` adds Prometheus (30 d retention), a blackbox exporter that
probes `api.<domain>/health`, the app shell and the admin every 30 s, Loki + Promtail for container
logs, and Grafana behind Traefik on `grafana.<domain>` (admin allow-list). Grafana is provisioned
with three datasources (Prometheus, Loki, Postgres) and one dashboard, `Language Master`:
uptime, story success rate, LLM cost today and per day (from `llm_usage`), story generations by
result, sync push latency (p50/p95/p99), pack download failures reported by clients, API latency
by route, requests by status, generation duration, DAU, tokens sold, and the API error log.

Metrics come from `GET /metrics` on the API (`apps/api/src/lib/metrics.ts`, internal network
only); business numbers are read from Postgres directly. Alert rules in
`docker/monitoring/prometheus/alerts.yml`: API down 3 min, app shell down 5 min, story failure
rate above 20 % for 30 min, sync p95 above 2 s. Wire Alertmanager or Grafana contact points to
e-mail when going live. Locally: `make monitoring-dev` with `pnpm dev:api` running, then
http://localhost:3300 (admin / admin).
