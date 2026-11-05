import type { Db } from "@lm/database";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

export function healthRoutes(db: Db, state: { migrated: boolean; version: string }) {
  const app = new Hono();
  app.get("/", async (c) => {
    let dbOk = false;
    try {
      await db.execute(sql`select 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return c.json(
      {
        ok: dbOk && state.migrated,
        db: dbOk,
        migrated: state.migrated,
        version: state.version,
        time: new Date().toISOString(),
      },
      dbOk ? 200 : 503,
    );
  });
  return app;
}
