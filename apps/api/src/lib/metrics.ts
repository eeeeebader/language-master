import { Counter, collectDefaultMetrics, Histogram, Registry } from "prom-client";

/** Prometheus registry for the API; scraped at GET /metrics (internal network only). */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "lm_api_" });

export const httpDuration = new Histogram({
  name: "lm_http_request_duration_seconds",
  help: "Request duration by route and status",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [registry],
});

export const syncPushDuration = new Histogram({
  name: "lm_sync_push_duration_seconds",
  help: "Sync push handling time",
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const syncEvents = new Counter({
  name: "lm_sync_events_total",
  help: "Review events accepted by sync push",
  registers: [registry],
});

export const storyGenerations = new Counter({
  name: "lm_story_generations_total",
  help: "Story generations by result",
  labelNames: ["result"] as const, // ok | failed | rejected | error
  registers: [registry],
});

export const storyDuration = new Histogram({
  name: "lm_story_generation_duration_seconds",
  help: "End-to-end story pipeline time for successful generations",
  buckets: [5, 10, 20, 30, 45, 60, 90, 120],
  registers: [registry],
});

export const llmCostCents = new Counter({
  name: "lm_llm_cost_cents_total",
  help: "Estimated LLM cost in cents by step",
  labelNames: ["step", "model"] as const,
  registers: [registry],
});

export const packManifestRequests = new Counter({
  name: "lm_pack_manifest_requests_total",
  help: "Pack manifest requests by outcome",
  labelNames: ["outcome"] as const, // served | missing
  registers: [registry],
});

/** Reported by clients that failed to download or verify a pack (POST /packs/report). */
export const packDownloadFailures = new Counter({
  name: "lm_pack_download_failures_total",
  help: "Pack download failures reported by clients",
  labelNames: ["kind", "reason"] as const,
  registers: [registry],
});

/** Normalise dynamic path segments so routes stay low-cardinality. */
export function routeLabel(path: string): string {
  return path
    .replace(/\/[0-9A-HJKMNP-TV-Z]{26}(?=\/|$)/g, "/:id")
    .replace(/\/[0-9a-f-]{36}(?=\/|$)/g, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .slice(0, 80);
}
