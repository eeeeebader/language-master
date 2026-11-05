import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, Page, Stat } from "@/components/ui";
import { list, single } from "@/lib/api";
import { fmtEur } from "@/lib/useToast";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => list<{ status: string }>("jobs") });
  const usage = useQuery({
    queryKey: ["llm_usage_daily"],
    queryFn: () => list<{ day: string; stories: number; cost_cents: number }>("llm_usage_daily"),
  });
  const analytics = useQuery({
    queryKey: ["analytics"],
    queryFn: () => single<{ dau: number; wau: number; story_success_rate: number }>("analytics"),
  });
  const today = usage.data?.[usage.data.length - 1];
  return (
    <Page title="Übersicht" subtitle="Betrieb auf einen Blick">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="DAU" value={analytics.data?.dau ?? "–"} tone="sage" />
        <Stat label="WAU" value={analytics.data?.wau ?? "–"} tone="sky" />
        <Stat label="Geschichten heute" value={today?.stories ?? "–"} tone="lavender" />
        <Stat
          label="LLM-Kosten heute"
          value={today ? fmtEur(today.cost_cents) : "–"}
          tone="amber"
        />
      </div>
      <Card className="mt-4">
        <div className="font-bold">Jobs</div>
        <div className="text-sm text-ink-2">
          {jobs.data?.filter((j) => j.status === "failed").length ?? 0} fehlgeschlagen ·{" "}
          {jobs.data?.length ?? 0} gesamt · Story-Erfolgsrate{" "}
          {analytics.data ? `${Math.round(analytics.data.story_success_rate * 100)} %` : "–"}
        </div>
      </Card>
    </Page>
  );
}
