import type { Db } from "@lm/database";
import { Hono } from "hono";
import { recordSyncPush } from "../lib/ops";
import { PushBody } from "../sync/logic";
import {
  pull,
  pullEvents,
  pushEvents,
  pushLww,
  recomputeWords,
  touchLastLogin,
} from "../sync/store";

export function syncRoutes(db: Db) {
  const app = new Hono();

  app.post("/push", async (c) => {
    const user = c.get("user");
    const parsed = PushBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "invalid body", issues: parsed.error.issues.slice(0, 5) }, 400);
    const body = parsed.data;
    const t0 = performance.now();
    const result = await db.transaction(async (tx) => {
      await pushLww(tx, user.id, body);
      const ev = await pushEvents(tx, user.id, body.events);
      await recomputeWords(tx, user.id, ev.affectedWordIds);
      return ev;
    });
    recordSyncPush(performance.now() - t0);
    await touchLastLogin(db, user.id);
    return c.json({
      acceptedEventIds: result.accepted,
      duplicateEventIds: result.duplicates,
      affectedWordIds: result.affectedWordIds,
      serverTime: new Date().toISOString(),
    });
  });

  app.get("/pull", async (c) => {
    const user = c.get("user");
    const data = await pull(db, user.id, c.req.query("since"));
    return c.json(data);
  });

  app.get("/pull/events", async (c) => {
    const user = c.get("user");
    return c.json(await pullEvents(db, user.id, c.req.query("since")));
  });

  return app;
}
