/**
 * Error tracking (Sentry, EU) and product analytics (PostHog Cloud EU).
 * Both are inert without their keys. Analytics is pseudonymous (distinct id = Supabase user id),
 * uses no cookies (memory persistence until identified, then localStorage), records no sessions
 * and respects the in-app opt-out and the browser's Do-Not-Track setting.
 */

import type { AnalyticsEvent } from "@lm/schema";
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com";
const OPT_OUT_KEY = "lm.analytics.optout";

let analyticsReady = false;

export function initTelemetry() {
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      release: import.meta.env.VITE_APP_VERSION as string | undefined,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
      beforeSend(event) {
        // never ship user-typed content
        if (event.request?.data) event.request.data = undefined;
        return event;
      },
    });
  }
  if (POSTHOG_KEY && !analyticsOptedOut() && navigator.doNotTrack !== "1") {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      persistence: "localStorage",
      disable_session_recording: true,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      person_profiles: "identified_only",
      respect_dnt: true,
    });
    analyticsReady = true;
  }
}

export function analyticsOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(optOut: boolean) {
  try {
    localStorage.setItem(OPT_OUT_KEY, optOut ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (!POSTHOG_KEY) return;
  if (optOut) {
    posthog.opt_out_capturing();
    posthog.reset();
    analyticsReady = false;
  } else if (!analyticsReady) {
    initTelemetry();
  } else {
    posthog.opt_in_capturing();
  }
}

export const analyticsAvailable = !!POSTHOG_KEY;

/** Typed capture; the event shape is validated at the type level by @lm/schema. */
export function track<E extends AnalyticsEvent>(name: E["name"], props: E["props"]) {
  if (!analyticsReady) return;
  posthog.capture(name, props);
}

export function identify(userId: string | null) {
  if (SENTRY_DSN) Sentry.setUser(userId ? { id: userId } : null);
  if (!analyticsReady) return;
  if (userId) posthog.identify(userId);
  else posthog.reset();
}

export function captureError(e: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  Sentry.captureException(e, context ? { extra: context } : undefined);
}
