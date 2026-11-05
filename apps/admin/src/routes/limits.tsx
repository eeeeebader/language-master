import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, Page, Toast, textarea } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";

export const Route = createFileRoute("/limits")({ component: Limits });

interface Setting {
  key: string;
  value_json: unknown;
  version: number;
  updated_by: string;
  updated_at: string;
}

const HELP: Record<string, string> = {
  free_stories_per_day: "Kostenlose Geschichten pro Tag (Free-Tier)",
  max_stories_per_day: "Hartes Tageslimit auch mit Tokens",
  llm_model: "Modell für Writer + Grammatik-Notizen",
  prompt_version: "Prompt-Version (Rollback = alte Version setzen)",
  pack_size_cap_mb: "Maximale Packgröße in MB",
  maintenance: "Wartungsflag: App zeigt Hinweis, Generierung aus",
  prices: "Preise zum A/B-Testen ohne Release",
};

function Limits() {
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({
    queryKey: ["app_settings"],
    queryFn: () => list<Setting>("app_settings"),
  });
  return (
    <Page
      title="Limits"
      subtitle="App-weite Einstellungen, versioniert; jede Änderung ist ein Audit-Eintrag"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {settings.data?.map((s) => (
          <SettingCard
            key={s.key}
            s={s}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["app_settings"] });
              toast.show("Gespeichert");
            }}
          />
        ))}
      </div>
      <Toast msg={toast.msg} />
    </Page>
  );
}

function SettingCard({ s, onSaved }: { s: Setting; onSaved: () => void }) {
  const [v, setV] = useState(JSON.stringify(s.value_json, null, 2));
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try {
      const value = JSON.parse(v);
      await apiPost("/admin/settings", { key: s.key, value_json: value });
      setErr(null);
      onSaved();
    } catch (e) {
      setErr(String(e));
    }
  }
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <div className="font-mono font-bold">{s.key}</div>
        <div className="text-xs text-ink-3">
          v{s.version} · {s.updated_by} · {fmtDate(s.updated_at)}
        </div>
      </div>
      <div className="mb-2 text-sm text-ink-2">{HELP[s.key] ?? ""}</div>
      <textarea
        className={textarea}
        rows={Math.min(8, v.split("\n").length + 1)}
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      {err && <div className="mt-1 text-xs text-rose-deep">{err}</div>}
      <Button size="sm" className="mt-2" onClick={save}>
        Speichern (v{s.version + 1})
      </Button>
    </Card>
  );
}
