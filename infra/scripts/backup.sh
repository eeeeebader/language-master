#!/usr/bin/env bash
# Nightly logical backup of the Supabase Postgres to a Hetzner Storage Box (or any rsync/sftp target).
# Usage: infra/scripts/backup.sh            (reads infra/supabase/.env for POSTGRES_PASSWORD)
# Env:   BACKUP_TARGET=u123456@u123456.your-storagebox.de:backups/language-master
#        BACKUP_KEEP_DAYS=30   SSH_PORT=23
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/infra/supabase/.env"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
: "${BACKUP_TARGET:?set BACKUP_TARGET=user@host:path}"
KEEP="${BACKUP_KEEP_DAYS:-30}"
PORT="${SSH_PORT:-23}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$ROOT/infra/supabase/backups"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/lm-$STAMP.sql.gz"

echo "dumping postgres -> $FILE"
docker compose -f "$ROOT/infra/supabase/docker-compose.yml" exec -T db \
  pg_dump -U postgres --no-owner --clean --if-exists postgres | gzip -9 > "$FILE"

echo "uploading to $BACKUP_TARGET"
rsync -az -e "ssh -p $PORT -o StrictHostKeyChecking=accept-new" "$FILE" "$BACKUP_TARGET/"

echo "pruning local copies older than $KEEP days"
find "$OUT_DIR" -name 'lm-*.sql.gz' -mtime +"$KEEP" -delete
echo "done"
