# Self-hosted Supabase for Language Master

Pinned upstream: `supabase/supabase` tag in [VERSION](VERSION) (files under this folder are the
unmodified `docker/` directory of that tag; only the compose project `name` is changed to
`lm-supabase`). Upstream docs: [README.upstream.md](README.upstream.md), [CONFIG.md](CONFIG.md).

The same stack runs on the dev machine and on the Hetzner server.

## 1. Secrets

```bash
cp infra/supabase/.env.example infra/supabase/.env
node infra/scripts/gen-keys.mjs >> infra/supabase/.env   # or: make keys
```

`gen-keys.mjs` prints `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` (HS256 JWTs, 10 years),
`POSTGRES_PASSWORD`, dashboard credentials and the other secrets the upstream `.env.example`
leaves as placeholders. Delete the placeholder lines in `.env` that the fragment overrides
(the last definition wins in compose, but keep the file tidy). Then set:

- `SITE_URL` / `API_EXTERNAL_URL` / `SUPABASE_PUBLIC_URL`: `https://db.<domain>` behind Traefik
  (local: `http://localhost:8000`).
- `ADDITIONAL_REDIRECT_URLS`: the app origins for magic links and OAuth
  (`https://app.<domain>/**,app.languagemaster.client://**`).
- SMTP settings for magic links (GoTrue): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
- `ENABLE_EMAIL_AUTOCONFIRM=false`, `DISABLE_SIGNUP=false`.

## 2. Run

```bash
make supabase-up        # docker compose -f infra/supabase/docker-compose.yml up -d
make supabase-down
```

- Studio: `http://localhost:8000` (Kong) with `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`.
- REST / Auth / Storage: `http://localhost:8000/rest/v1`, `/auth/v1`, `/storage/v1`.
- Postgres direct: `localhost:5432` (`postgres` / `POSTGRES_PASSWORD`); pooler on `6543`.
- Drizzle migrations from `packages/database` run inside the API container on start; point
  `DATABASE_URL` at `postgres://postgres:<pw>@db:5432/postgres` (the api joins the
  `lm-supabase_default` network, see `docker/docker-compose.yml`).

In production, Traefik publishes Kong as `db.<domain>` (see `docker/docker-compose.yml`), and
the Studio route is restricted to the admin IP allow-list.

## 3. Backups

- Supabase Pro-style daily backups are replaced by `infra/scripts/backup.sh`: `pg_dump`
  through the `db` container, gzip, rsync to a Hetzner Storage Box, prune after 30 days.
- Install `infra/systemd/lm-backup.{service,timer}` on the server
  (`/etc/language-master/backup.env` from `backup.env.example`).
- Restore with `infra/scripts/restore.sh <file>`.
- Dictionary packs and audio are rebuildable from the repo; Storage objects are on the
  `volumes/storage` bind mount and are included in the nightly rsync if you add that path.

## 4. Upgrades

Bump [VERSION](VERSION), re-fetch the upstream `docker/` directory at that tag
(`make supabase-fetch`), review `CHANGELOG.md` / `upgrades.json`, then `make supabase-up`.
