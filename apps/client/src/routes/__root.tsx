import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Nav } from "@/components/Nav";
import { OFFICIAL_STORIES } from "@/data/stories-es";
import { db } from "@/db/db";
import { learningEventHooks } from "@/db/repo";
import { useSettings } from "@/hooks/useSettings";
import { initAudio } from "@/lib/audio-pack";
import { listenForNativeAuth, onAuthChange } from "@/lib/auth";
import { checkConsent, onPendingConsent } from "@/lib/consent";
import { ensurePack } from "@/lib/dict-pack";
import { setHaptics } from "@/lib/haptics";
import { rescheduleNotifications } from "@/lib/notifications";
import { setMuted } from "@/lib/sound";
import { refreshOfficialStories } from "@/lib/stories";
import { startSyncScheduler } from "@/lib/sync";
import { identify, track } from "@/lib/telemetry";

export const Route = createRootRoute({ component: Root });

const NO_NAV = [
  "/onboarding",
  "/tour",
  "/consent",
  "/karteikarten/session",
  "/stories/",
  "/legal/",
];

function Root() {
  const settings = useSettings();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Versioned consent: a new AGB/Datenschutz version flagged for re-consent blocks the app.
  useEffect(() => {
    const run = () => checkConsent().catch(() => undefined);
    run();
    const offAuth = onAuthChange((s) => {
      identify(s?.user.id ?? null);
      if (s) {
        run();
        track("signed_in", {});
      }
    });
    const offPending = onPendingConsent((p) => {
      if (p.length > 0 && window.location.pathname !== "/consent") navigate({ to: "/consent" });
    });
    return () => {
      offAuth();
      offPending();
    };
  }, [navigate]);

  // Native: magic links open the app through its URL scheme.
  useEffect(() => listenForNativeAuth(), []);

  // Dictionary pack: open the installed one, then check the manifest for updates.
  useEffect(() => {
    ensurePack()
      .then(() => initAudio())
      .catch(() => undefined);
  }, []);

  // Seed official stories once so the stories table is the single source for the library.
  useEffect(() => {
    (async () => {
      for (const s of OFFICIAL_STORIES)
        if (!(await db.stories.get(s.id))) await db.stories.put({ ...s, archived: false });
      await refreshOfficialStories();
    })();
  }, []);

  // Outbox sync: no-op in local-only mode (no VITE_SUPABASE_URL / VITE_API_URL).
  useEffect(() => startSyncScheduler(), []);

  useEffect(() => {
    if (!settings) return;
    setMuted(!settings.soundOn);
    setHaptics(settings.hapticsOn);
  }, [settings]);

  // Reminders are recomputed from local data on every app open and foreground.
  useEffect(() => {
    if (!settings) return;
    const run = () => rescheduleNotifications().catch(() => undefined);
    run();
    learningEventHooks.push(run);
    const onVis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      learningEventHooks.splice(learningEventHooks.indexOf(run), 1);
    };
  }, [settings]);

  useEffect(() => {
    if (settings === undefined) return; // loading
    const publicPath = path === "/onboarding" || path.startsWith("/legal") || path === "/faq";
    if (!settings && !publicPath) navigate({ to: "/onboarding" });
  }, [settings, path, navigate]);

  if (settings === undefined)
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">…</div>;

  const hideNav = NO_NAV.some((p) =>
    p.endsWith("/") ? path.startsWith(p) && path.length > p.length : path.startsWith(p),
  );
  return (
    <>
      <Outlet />
      {settings && !hideNav && <Nav />}
    </>
  );
}
