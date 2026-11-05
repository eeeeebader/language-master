# Language Master — developer and operator entry points
SHELL := /bin/bash
SUPA := docker compose -f infra/supabase/docker-compose.yml
STACK := docker compose -f docker/docker-compose.yml --env-file docker/.env
STACK_DEV := $(STACK) -f docker/docker-compose.dev.yml

.PHONY: help dev keys supabase-up supabase-down supabase-fetch supabase-logs stack-up stack-down stack-dev stack-logs build-images backup restore check

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

dev: ## run the client dev server (and the API if apps/api exists)
	pnpm install
	@if [ -d apps/api ]; then pnpm -r --parallel --filter @lm/client --filter @lm/api dev; else pnpm --filter @lm/client dev; fi

keys: ## generate Supabase secrets (.env fragment on stdout)
	node infra/scripts/gen-keys.mjs

supabase-up: ## start self-hosted Supabase (infra/supabase/.env required)
	@test -f infra/supabase/.env || { echo "create infra/supabase/.env first (see infra/supabase/README.md)"; exit 1; }
	$(SUPA) up -d

supabase-down: ## stop Supabase
	$(SUPA) down

supabase-logs: ## tail Supabase logs
	$(SUPA) logs -f --tail=100

supabase-fetch: ## re-fetch upstream docker/ dir at infra/supabase/VERSION
	python3 infra/scripts/fetch-supabase.py

stack-up: ## start traefik, api, nlp, piper, static sites (docker/.env required)
	@test -f docker/.env || { echo "create docker/.env from docker/.env.example"; exit 1; }
	$(STACK) up -d --remove-orphans

stack-down: ## stop the app stack
	$(STACK) down

stack-dev: ## app stack with the local override (no TLS, bind mounts)
	$(STACK_DEV) up --build

stack-logs: ## tail app stack logs
	$(STACK) logs -f --tail=100

build-images: ## build all images locally
	pnpm -r build
	$(STACK) build

backup: ## pg_dump Supabase to the Storage Box (BACKUP_TARGET env)
	infra/scripts/backup.sh

restore: ## restore a backup: make restore FILE=path.sql.gz
	infra/scripts/restore.sh $(FILE)

check: ## validate compose files like CI does
	docker network inspect lm-supabase_default >/dev/null 2>&1 || docker network create lm-supabase_default
	docker compose -f docker/docker-compose.yml --env-file docker/.env.example config -q
	docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml --env-file docker/.env.example config -q
	docker compose -f infra/supabase/docker-compose.yml --env-file infra/supabase/.env.example config -q

