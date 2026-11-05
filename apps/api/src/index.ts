import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { startCron } from "./cron";
import { closeDb, getDb, runMigrations } from "./db";
import { loadEnv } from "./env";
import { log } from "./lib/log";

// Local development: read apps/api/.env when present (containers get their env from compose).
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file */
}

const env = loadEnv();
const { db, sql } = getDb(env.DATABASE_URL);
const state = { migrated: false, version: process.env.npm_package_version ?? "0.1.0" };

if (env.RUN_MIGRATIONS) {
  const applied = await runMigrations(sql);
  log.info("migrations ok", { applied: applied.length });
}
state.migrated = true;

const stopCron = env.RUN_CRON ? startCron(db) : () => undefined;
const app = createApp(db, env, state);
const server = serve({ fetch: app.fetch, port: env.PORT }, (info) =>
  log.info("api listening", { port: info.port }),
);

async function shutdown() {
  stopCron();
  server.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
