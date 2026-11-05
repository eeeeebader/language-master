# syntax=docker/dockerfile:1
# Workspace packages are consumed as TypeScript sources (their package.json points at src/),
# so the image runs the API with tsx instead of a separate emit step.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/schema/package.json packages/schema/
COPY packages/srs/package.json packages/srs/
COPY packages/database/package.json packages/database/
RUN pnpm install --frozen-lockfile --filter @lm/api...

FROM deps AS runtime
ENV NODE_ENV=production
COPY packages/schema packages/schema
COPY packages/srs packages/srs
COPY packages/database packages/database
COPY apps/api apps/api
RUN pnpm --filter @lm/api typecheck
WORKDIR /repo/apps/api
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["pnpm", "start"]
