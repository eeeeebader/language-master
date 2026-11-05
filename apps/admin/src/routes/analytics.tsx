import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, Page, Stat } from "@/components/ui";
import { single } from "@/lib/api";

export const Route = createFileRoute("/analytics")({ component: Analytics });

interface A {
  dau: number;
  wau: number;
  funnel: { onboarded?: number; onboarding?: number; first_session: number; day7: number };
  story_success_rate: number;
  minutes_by_mode: Record<string, number>;
}

function Analytics() {
  const a = useQuery({ queryKey: ["analytics"], queryFn: () => single<A>("analytics") });
  const d = a.data;
  const f = d?.funnel
    ? { ...d.funnel, onboarding: d.funnel.onboarding ?? d.funnel.onboarded ?? 0 }
    : undefined;
  return (
    <Page
      title="Analytics"
      subtitle="PostHog Cloud EU (Events aus packages/schema/events.ts) oder eigene Queries; v1 light"
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="DAU" value={d?.dau ?? "–"} tone="sage" />
        <Stat label="WAU" value={d?.wau ?? "–"} tone="sky" />
        <Stat label="DAU/WAU" value={d ? `${Math.round((d.dau / d.wau) * 100)} %` : "–"} />
        <Stat
          label="Story-Erfolgsrate"
          value={d ? `${Math.round(d.story_success_rate * 100)} %` : "–"}
          tone="lavender"
        />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 font-bold">Funnel: Onboarding → erste Sitzung → Tag 7</div>
          {f &&
            [
              ["Onboarding", f.onboarding],
              ["Erste Sitzung", f.first_session],
              ["Tag 7 aktiv", f.day7],
            ].map(([l, v]) => (
              <div key={String(l)} className="mb-1">
                <div className="flex justify-between text-sm">
                  <span>{l}</span>
                  <span>
                    {v} · {f.onboarding ? Math.round((Number(v) / f.onboarding) * 100) : 0} %
                  </span>
                </div>
                <div className="h-2 rounded-chip bg-paper-2">
                  <div
                    className="h-full rounded-chip bg-sage"
                    style={{ width: `${f.onboarding ? (Number(v) / f.onboarding) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
        </Card>
        <Card>
          <div className="mb-2 font-bold">Sitzungsminuten nach Modus (Ø/Tag)</div>
          {d &&
            Object.entries(d.minutes_by_mode).map(([m, v]) => (
              <div key={m} className="mb-1 flex items-center gap-2 text-sm">
                <span className="w-24">{m}</span>
                <div className="h-2 flex-1 rounded-chip bg-paper-2">
                  <div
                    className="h-full rounded-chip bg-lavender"
                    style={{ width: `${(v / 40) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right">{v}</span>
              </div>
            ))}
        </Card>
      </div>
    </Page>
  );
}
