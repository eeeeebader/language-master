import * as Sentry from "@sentry/node";

/** Error tracking (EU region DSN). Inert without SENTRY_DSN. */
export function initSentry(dsn: string | undefined, release: string, environment: string) {
  if (!dsn) return false;
  Sentry.init({ dsn, release, environment, tracesSampleRate: 0 });
  return true;
}

export function captureException(e: unknown, extra?: Record<string, unknown>) {
  Sentry.captureException(e, extra ? { extra } : undefined);
}
