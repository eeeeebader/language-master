#!/usr/bin/env bash
# Restore a backup produced by backup.sh into the running Supabase db container.
# Usage: infra/scripts/restore.sh path/to/lm-20260101T020000Z.sql.gz
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FILE="${1:?backup file}"
read -r -p "This overwrites the database. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || exit 1
gunzip -c "$FILE" | docker compose -f "$ROOT/infra/supabase/docker-compose.yml" exec -T db psql -U postgres postgres
echo "restored $FILE"
