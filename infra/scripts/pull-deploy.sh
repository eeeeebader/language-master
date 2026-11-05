#!/usr/bin/env bash
# Server-side pull agent: no inbound SSH from CI. Runs from a systemd timer every few minutes,
# logs in to GHCR with a read-only token, pulls the images and rolls them behind Traefik.
# Env (in /etc/language-master/deploy.env): GHCR_OWNER, GHCR_USER, GHCR_TOKEN, STACK_DIR
set -euo pipefail
ENV_FILE="${DEPLOY_ENV:-/etc/language-master/deploy.env}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
STACK_DIR="${STACK_DIR:-/opt/language-master}"
cd "$STACK_DIR"

echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
BEFORE="$(docker compose -f docker/docker-compose.yml --env-file docker/.env images -q | sort | sha256sum)"
docker compose -f docker/docker-compose.yml --env-file docker/.env pull --quiet
AFTER="$(docker compose -f docker/docker-compose.yml --env-file docker/.env images -q | sort | sha256sum)"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "new images, rolling"
  docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --remove-orphans
  docker image prune -f >/dev/null
else
  echo "up to date"
fi
