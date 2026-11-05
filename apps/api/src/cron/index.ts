import type { Db } from "@lm/database";
import { log } from "../lib/log";
import { runRetention } from "./retention";

/** Minimal in-process scheduler: nightly retention. One API container in v1. */
export function startCron(db: Db) {
  const DAY = 24 * 60 * 60 * 1000;
  const tick = () =>
    runRetention(db).catch((e) => log.error("cron tick failed", { error: String(e) }));
  // first run 5 minutes after boot, then daily
  const first = setTimeout(tick, 5 * 60_000);
  const interval = setInterval(tick, DAY);
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
