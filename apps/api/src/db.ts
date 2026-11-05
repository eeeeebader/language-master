import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_SETTINGS_DEFAULTS, appSettings, createDb, type Db } from "@lm/database";
import { log } from "./lib/log";

let handle: ReturnType<typeof createDb> | null = null;

export function getDb(url: string): { db: Db; sql: ReturnType<typeof createDb>["sql"] } {
  if (!handle) handle = createDb(url, { max: 10 });
  return handle;
}

export async function closeDb() {
  await handle?.close();
  handle = null;
}

const MIGRATION_LOCK_KEY = 7_423_001;

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/api/src → packages/database/migrations (same layout in the image)
  return join(here, "..", "..", "..", "packages", "database", "migrations");
}

/** Apply SQL migrations in file order, once, under a Postgres advisory lock. */
export async function runMigrations(
  sql: ReturnType<typeof createDb>["sql"],
  dir = migrationsDir(),
): Promise<string[]> {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
    await tx`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set(
      (await tx`select name from schema_migrations`).map((r) => r.name as string),
    );
    for (const f of files) {
      if (done.has(f)) continue;
      const body = readFileSync(join(dir, f), "utf8");
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${f})`;
      applied.push(f);
      log.info("migration applied", { file: f });
    }
  });
  return applied;
}

/** Insert app_settings defaults that are missing, so the admin Limits module always has rows. */
export async function seedDefaults(db: Db): Promise<number> {
  let inserted = 0;
  for (const [key, value] of Object.entries(APP_SETTINGS_DEFAULTS)) {
    const r = await db
      .insert(appSettings)
      .values({ key, valueJson: value as never, version: 1 })
      .onConflictDoNothing()
      .returning({ key: appSettings.key });
    inserted += r.length;
  }
  return inserted;
}
