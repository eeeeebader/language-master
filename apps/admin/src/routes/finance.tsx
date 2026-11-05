import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, Page, Stat } from "@/components/ui";
import { list, single } from "@/lib/api";
import { fmtEur } from "@/lib/useToast";

export const Route = createFileRoute("/finance")({ component: Finance });

interface Revenue {
  stripe_cents_30d: number;
  iap_cents_30d: number;
  refunds_cents_30d: number;
  tokens_sold_30d: number;
  supporters_cents_30d: number;
}

function Finance() {
  const rev = useQuery({ queryKey: ["revenue"], queryFn: () => single<Revenue>("revenue") });
  const usage = useQuery({
    queryKey: ["llm_usage_daily"],
    queryFn: () => list<{ day: string; stories: number; cost_cents: number }>("llm_usage_daily"),
  });
  const r = rev.data;
  const cost30 = (usage.data ?? []).reduce((a, d) => a + d.cost_cents, 0);
  const gross = r
    ? r.stripe_cents_30d + r.iap_cents_30d + r.supporters_cents_30d - r.refunds_cents_30d
    : 0;
  const avgDaily = usage.data?.length ? cost30 / usage.data.length : 0;
  return (
    <Page
      title="Finanzen"
      subtitle="Stripe + RevenueCat Umsatz, Erstattungen, Token-Verkäufe, LLM-Kosten (llm_usage), Bruttomarge; 90-Tage-Projektion aus 30-Tage-Mittel (v1 light)"
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Stripe (30 T.)" value={r ? fmtEur(r.stripe_cents_30d) : "–"} tone="sky" />
        <Stat
          label="App Stores (30 T.)"
          value={r ? fmtEur(r.iap_cents_30d) : "–"}
          tone="lavender"
        />
        <Stat
          label="Unterstützung (30 T.)"
          value={r ? fmtEur(r.supporters_cents_30d) : "–"}
          tone="rose"
        />
        <Stat
          label="Erstattungen (30 T.)"
          value={r ? fmtEur(r.refunds_cents_30d) : "–"}
          tone="amber"
        />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Stat label="Tokens verkauft" value={r?.tokens_sold_30d ?? "–"} />
        <Stat label="LLM-Kosten (Zeitraum)" value={fmtEur(cost30)} />
        <Stat
          label="Bruttomarge"
          value={gross ? `${Math.round(((gross - cost30) / gross) * 100)} %` : "–"}
          tone="sage"
        />
        <Stat label="LLM-Projektion 90 T." value={fmtEur(Math.round(avgDaily * 90))} />
      </div>
      <Card className="mt-4">
        <div className="mb-2 font-bold">LLM-Kosten pro Tag</div>
        <div className="flex h-28 items-end gap-2">
          {usage.data?.map((d) => (
            <div
              key={d.day}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${d.day}: ${d.stories} Geschichten, ${fmtEur(d.cost_cents)}`}
            >
              <div
                className="w-full rounded-t-md bg-amber"
                style={{ height: `${Math.max(4, d.cost_cents)}px` }}
              />
              <span className="text-[10px] text-ink-3">{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}
