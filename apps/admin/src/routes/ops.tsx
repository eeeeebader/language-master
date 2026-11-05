import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Badge, Button, Card, Page, Stat } from "@/components/ui";
import { apiGet } from "@/lib/api";

export const Route = createFileRoute("/ops")({ component: Ops });

interface Ping {
  ok: boolean;
  ms: number;
  error?: string;
}
interface OpsData {
  checked_at: string;
  services: { database: Ping; nlp: Ping; piper: Ping | null };
  process: {
    started_at: string;
    uptime_s: number;
    requests_by_status: Record<string, number>;
    routes: { route: string; requests: number; avg_ms: number }[];
    sync_push_ms: { samples: number; p50: number | null; p95: number | null; p99: number | null };
    stories: {
      ok: number;
      failed: number;
      rejected: number;
      error: number;
      duration_p50_s: number | null;
      duration_p95_s: number | null;
    };
    llm_cost_cents_since_start: number;
    memory_mb: number;
    node: string;
  };
  stories: { days: { day: string; ok: number; failed: number }[]; success_rate_30d: number | null };
  llm_cost: {
    days: { day: string; step: string; cents: number; tokens_in: number; tokens_out: number }[];
    total_cents_30d: number;
  };
  pack_failures: {
    total_30d: number;
    by_kind_reason: Record<string, number>;
    recent: { at: string; data: Record<string, unknown> }[];
  };
  errors: { id: string; at: string; path?: string; method?: string; message?: string }[];
  jobs: {
    id: string;
    name: string;
    started_at?: string;
    startedAt?: string;
    finished_at?: string | null;
    finishedAt?: string | null;
    status: string;
    summary: unknown;
  }[];
}

const eur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const uptime = (s: number) =>
  s < 3600
    ? `${Math.round(s / 60)} min`
    : s < 86_400
      ? `${(s / 3600).toFixed(1)} h`
      : `${(s / 86_400).toFixed(1)} d`;

function Bars({
  rows,
  colour = "bg-sage",
  max,
}: {
  rows: { label: string; value: number; sub?: string }[];
  colour?: string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex h-28 items-end gap-1">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex flex-1 flex-col items-center gap-1"
          title={`${r.label}: ${r.value}${r.sub ? ` (${r.sub})` : ""}`}
        >
          <div
            className={`w-full rounded-t ${colour}`}
            style={{ height: `${Math.max(2, (r.value / top) * 96)}px` }}
          />
          <span className="text-[9px] text-ink-3">{r.label.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function Service({ name, p }: { name: string; p: Ping | null }) {
  if (!p) return <Badge tone="grey">{name}: nicht konfiguriert</Badge>;
  return (
    <Badge tone={p.ok ? "sage" : "rose"}>
      {name}: {p.ok ? `ok · ${p.ms} ms` : `Fehler${p.error ? ` · ${p.error}` : ""}`}
    </Badge>
  );
}

function Ops() {
  const q = useQuery({
    queryKey: ["ops"],
    queryFn: () => apiGet<OpsData>("/admin/ops"),
    refetchInterval: 60_000,
  });
  const d = q.data;
  const p = d?.process;
  const days = d
    ? [
        ...new Set([...d.stories.days.map((x) => x.day), ...d.llm_cost.days.map((x) => x.day)]),
      ].sort()
    : [];
  const costByDay = days.map((day) => ({
    label: day,
    value: d?.llm_cost.days.filter((x) => x.day === day).reduce((a, x) => a + x.cents, 0) ?? 0,
  }));
  const okByDay = days.map((day) => ({
    label: day,
    value: d?.stories.days.find((x) => x.day === day)?.ok ?? 0,
  }));
  const failedByDay = days.map((day) => ({
    label: day,
    value: d?.stories.days.find((x) => x.day === day)?.failed ?? 0,
  }));
  const statuses = p ? Object.entries(p.requests_by_status).sort() : [];
  const totalReq = statuses.reduce((a, [, n]) => a + n, 0);

  return (
    <Page
      title="Betrieb"
      subtitle={
        d
          ? `Stand ${new Date(d.checked_at).toLocaleTimeString("de-DE")} · API seit ${new Date(p?.started_at ?? 0).toLocaleString("de-DE")}`
          : "Lädt …"
      }
      action={
        <Button variant="secondary" onClick={() => q.refetch()}>
          Aktualisieren
        </Button>
      }
    >
      {q.error && <Card tone="rose">Betriebsdaten nicht erreichbar: {String(q.error)}</Card>}

      <Card className="mb-4">
        <div className="mb-2 font-bold">Dienste</div>
        <div className="flex flex-wrap gap-2">
          <Service name="Datenbank" p={d?.services.database ?? null} />
          <Service name="NLP (spaCy)" p={d?.services.nlp ?? null} />
          <Service name="Piper" p={d?.services.piper ?? null} />
          {p && (
            <>
              <Badge tone="sky">API-Laufzeit {uptime(p.uptime_s)}</Badge>
              <Badge tone="grey">
                {p.memory_mb} MB RSS · Node {p.node}
              </Badge>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat
          label="Story-Erfolgsrate (30 d)"
          value={
            d?.stories.success_rate_30d == null
              ? "–"
              : `${Math.round(d.stories.success_rate_30d * 100)} %`
          }
          tone="lavender"
        />
        <Stat
          label="LLM-Kosten (30 d, Schätzung)"
          value={d ? eur(d.llm_cost.total_cents_30d) : "–"}
          tone="amber"
        />
        <Stat
          label="Sync-Push p95"
          value={p?.sync_push_ms.p95 == null ? "–" : `${Math.round(p.sync_push_ms.p95)} ms`}
          tone="sky"
        />
        <Stat
          label="Pack-Downloads fehlgeschlagen (30 d)"
          value={d?.pack_failures.total_30d ?? "–"}
          tone={d && d.pack_failures.total_30d > 0 ? "rose" : "sage"}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 font-bold">Geschichten pro Tag (erfolgreich / fehlgeschlagen)</div>
          {days.length === 0 ? (
            <p className="text-sm text-ink-3">Noch keine Geschichten in den letzten 30 Tagen.</p>
          ) : (
            <>
              <Bars rows={okByDay} colour="bg-sage" />
              <Bars
                rows={failedByDay}
                colour="bg-rose"
                max={Math.max(1, ...okByDay.map((r) => r.value))}
              />
            </>
          )}
          {p && (
            <p className="mt-2 text-xs text-ink-3">
              Seit Prozessstart: {p.stories.ok} ok · {p.stories.failed} fehlgeschlagen ·{" "}
              {p.stories.rejected} abgelehnt (Quota) · {p.stories.error} Fehler · Dauer p50{" "}
              {p.stories.duration_p50_s ?? "–"} s, p95 {p.stories.duration_p95_s ?? "–"} s
            </p>
          )}
        </Card>
        <Card>
          <div className="mb-2 font-bold">LLM-Kosten pro Tag (Cent, Schätzung aus llm_usage)</div>
          {days.length === 0 ? (
            <p className="text-sm text-ink-3">Keine LLM-Nutzung in den letzten 30 Tagen.</p>
          ) : (
            <Bars rows={costByDay} colour="bg-amber" />
          )}
          {d && d.llm_cost.days.length > 0 && (
            <table className="mt-2 w-full text-xs">
              <tbody>
                {Object.entries(
                  d.llm_cost.days.reduce<
                    Record<string, { cents: number; tin: number; tout: number }>
                  >((acc, x) => {
                    const a = acc[x.step] ?? { cents: 0, tin: 0, tout: 0 };
                    acc[x.step] = {
                      cents: a.cents + x.cents,
                      tin: a.tin + x.tokens_in,
                      tout: a.tout + x.tokens_out,
                    };
                    return acc;
                  }, {}),
                ).map(([step, v]) => (
                  <tr key={step} className="border-t border-line">
                    <td className="py-1">{step}</td>
                    <td className="py-1 text-right tabular-nums">
                      {v.tin.toLocaleString("de-DE")} in
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {v.tout.toLocaleString("de-DE")} out
                    </td>
                    <td className="py-1 text-right tabular-nums">{eur(v.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 font-bold">API-Anfragen seit Prozessstart</div>
          <div className="flex flex-wrap gap-2">
            {statuses.map(([s, n]) => (
              <Badge
                key={s}
                tone={s.startsWith("5") ? "rose" : s.startsWith("4") ? "amber" : "sage"}
              >
                {s}: {n} ({totalReq ? Math.round((n / totalReq) * 100) : 0} %)
              </Badge>
            ))}
            {p && (
              <Badge tone="sky">
                Sync-Push p50{" "}
                {p.sync_push_ms.p50 == null ? "–" : `${Math.round(p.sync_push_ms.p50)} ms`} · p99{" "}
                {p.sync_push_ms.p99 == null ? "–" : `${Math.round(p.sync_push_ms.p99)} ms`} ·{" "}
                {p.sync_push_ms.samples} Pushes
              </Badge>
            )}
          </div>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-ink-3">
                <th className="py-1 font-medium">Route</th>
                <th className="py-1 text-right font-medium">Anfragen</th>
                <th className="py-1 text-right font-medium">Ø ms</th>
              </tr>
            </thead>
            <tbody>
              {p?.routes.map((r) => (
                <tr key={r.route} className="border-t border-line">
                  <td className="py-1 font-mono">{r.route}</td>
                  <td className="py-1 text-right tabular-nums">{r.requests}</td>
                  <td className="py-1 text-right tabular-nums">{r.avg_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <div className="mb-2 font-bold">Pack-Downloads: Fehler nach Art (30 d)</div>
          {d && Object.keys(d.pack_failures.by_kind_reason).length === 0 ? (
            <p className="text-sm text-ink-3">Keine gemeldeten Fehler.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {d &&
                Object.entries(d.pack_failures.by_kind_reason).map(([k, n]) => (
                  <Badge key={k} tone="rose">
                    {k}: {n}
                  </Badge>
                ))}
            </div>
          )}
          <div className="mt-4 mb-2 font-bold">Letzte Jobs</div>
          <table className="w-full text-xs">
            <tbody>
              {d?.jobs.map((j) => (
                <tr key={j.id} className="border-t border-line">
                  <td className="py-1">{j.name}</td>
                  <td className="py-1 text-ink-3">
                    {new Date((j.started_at ?? j.startedAt) as string).toLocaleString("de-DE")}
                  </td>
                  <td className="py-1 text-right">
                    <Badge
                      tone={j.status === "ok" ? "sage" : j.status === "failed" ? "rose" : "amber"}
                    >
                      {j.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-2 font-bold">Letzte API-Fehler</div>
        {d && d.errors.length === 0 ? (
          <p className="text-sm text-ink-3">Keine Fehler protokolliert.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {d?.errors.map((e) => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="py-1 whitespace-nowrap text-ink-3">
                    {new Date(e.at).toLocaleString("de-DE")}
                  </td>
                  <td className="py-1 font-mono whitespace-nowrap">
                    {e.method} {e.path}
                  </td>
                  <td className="py-1">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}
