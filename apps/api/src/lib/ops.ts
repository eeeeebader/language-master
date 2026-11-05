/**
 * In-process operations stats for the admin "Betrieb" module: request counts by status, sync push
 * timings and story outcomes since the process started. Durable facts (errors, pack failures) go
 * to the ops_events table so they survive restarts.
 */
const startedAt = Date.now();
const requestsByStatus = new Map<string, number>();
const requestsByRoute = new Map<string, { n: number; totalMs: number }>();
const syncPushMs: number[] = [];
const storyMs: number[] = [];
const stories = { ok: 0, failed: 0, rejected: 0, error: 0 };
let llmCostCents = 0;
const MAX_SAMPLES = 2000;

function push(arr: number[], v: number) {
  arr.push(v);
  if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
}

export function recordRequest(method: string, route: string, status: number, ms: number) {
  const bucket = `${Math.floor(status / 100)}xx`;
  requestsByStatus.set(bucket, (requestsByStatus.get(bucket) ?? 0) + 1);
  const key = `${method} ${route}`;
  const r = requestsByRoute.get(key) ?? { n: 0, totalMs: 0 };
  r.n++;
  r.totalMs += ms;
  requestsByRoute.set(key, r);
}
export function recordSyncPush(ms: number) {
  push(syncPushMs, ms);
}
export function recordStory(result: keyof typeof stories, ms?: number, costCents = 0) {
  stories[result]++;
  llmCostCents += costCents;
  if (ms !== undefined) push(storyMs, ms);
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

/** Normalise dynamic path segments so route lists stay short. */
export function routeLabel(path: string): string {
  return path
    .replace(/\/[0-9A-HJKMNP-TV-Z]{26}(?=\/|$)/g, "/:id")
    .replace(/\/[0-9a-f-]{36}(?=\/|$)/g, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .slice(0, 80);
}

export function processStats() {
  const routes = [...requestsByRoute.entries()]
    .map(([route, r]) => ({ route, requests: r.n, avg_ms: Math.round(r.totalMs / r.n) }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 20);
  return {
    started_at: new Date(startedAt).toISOString(),
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
    requests_by_status: Object.fromEntries(requestsByStatus),
    routes,
    sync_push_ms: {
      samples: syncPushMs.length,
      p50: percentile(syncPushMs, 50),
      p95: percentile(syncPushMs, 95),
      p99: percentile(syncPushMs, 99),
    },
    stories: {
      ...stories,
      duration_p50_s:
        percentile(storyMs, 50) === null
          ? null
          : Math.round((percentile(storyMs, 50) as number) / 100) / 10,
      duration_p95_s:
        percentile(storyMs, 95) === null
          ? null
          : Math.round((percentile(storyMs, 95) as number) / 100) / 10,
    },
    llm_cost_cents_since_start: Math.round(llmCostCents * 100) / 100,
    memory_mb: Math.round(process.memoryUsage().rss / 1_048_576),
    node: process.version,
  };
}
