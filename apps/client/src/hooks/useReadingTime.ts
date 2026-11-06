import { toLocalDay } from "@lm/srs";
import { useEffect } from "react";
import { bumpActivity } from "@/db/repo";

/**
 * Time spent on a page counts towards the daily minutes (and so the streak): flushed every
 * minute, when the tab goes hidden and on leave. Stretches under five seconds are ignored.
 */
export function useReadingTime() {
  useEffect(() => {
    let since = performance.now();
    const flush = () => {
      const ms = performance.now() - since;
      since = performance.now();
      if (ms > 5_000)
        bumpActivity(toLocalDay(new Date()), { minutes: Math.round((ms / 60_000) * 10) / 10 });
    };
    const iv = setInterval(flush, 60_000);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
      else since = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, []);
}
