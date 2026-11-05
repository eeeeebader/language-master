import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Nav } from "@/components/Nav";
import { OFFICIAL_STORIES } from "@/data/stories-es";
import { db } from "@/db/db";
import { useSettings } from "@/hooks/useSettings";
import { initAudio } from "@/lib/audio-pack";
import { ensurePack } from "@/lib/dict-pack";
import { setHaptics } from "@/lib/haptics";
import { setMuted } from "@/lib/sound";
import { startSyncScheduler } from "@/lib/sync";

export const Route = createRootRoute({ component: Root });

const NO_NAV = ["/onboarding", "/tour", "/karteikarten/session", "/stories/"];

function Root() {
  const settings = useSettings();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

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
    })();
  }, []);

  // Outbox sync: no-op in local-only mode (no VITE_SUPABASE_URL / VITE_API_URL).
  useEffect(() => startSyncScheduler(), []);

  useEffect(() => {
    if (!settings) return;
    setMuted(!settings.soundOn);
    setHaptics(settings.hapticsOn);
  }, [settings]);

  useEffect(() => {
    if (settings === undefined) return; // loading
    if (!settings && path !== "/onboarding") navigate({ to: "/onboarding" });
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
