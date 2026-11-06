import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, cx, input, Page, Toast, textarea } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";
import { Switch } from "./users";

export const Route = createFileRoute("/limits")({ component: Limits });

interface Setting {
  key: string;
  value_json: unknown;
  version: number;
  updated_by: string;
  updated_at: string;
}

/** What each key means, how it is edited, and where it sits on the page. */
const META: Record<
  string,
  { label: string; hint: string; group: string; kind?: "cents" | "select"; options?: string[] }
> = {
  "stories.free_per_day": {
    label: "Freie Geschichten pro Tag",
    hint: "Für Free-Nutzer; pro Nutzer überschreibbar unter Users",
    group: "Geschichten",
  },
  "stories.max_per_day": {
    label: "Hartes Tageslimit",
    hint: "Gilt auch mit Tokens, schützt vor Missbrauch",
    group: "Geschichten",
  },
  "stories.free_active_limit": {
    label: "Aktive Geschichten (Free)",
    hint: "Mehr wandert ins Archiv",
    group: "Geschichten",
  },
  "stories.premium_archive_limit": {
    label: "Archiv (Premium)",
    hint: "Gespeicherte Geschichten für Premium",
    group: "Geschichten",
  },
  "llm.provider": {
    label: "LLM-Anbieter",
    hint: "fake = deterministisch, keine Kosten (nur Entwicklung)",
    group: "Sprachmodell",
    kind: "select",
    options: ["anthropic", "openai", "fake"],
  },
  "llm.model.write": {
    label: "Modell · Writer",
    hint: "Schreibt die Geschichte",
    group: "Sprachmodell",
  },
  "llm.model.notes": {
    label: "Modell · Notizen",
    hint: "Grammatik-Notizen",
    group: "Sprachmodell",
  },
  "llm.model.openai": {
    label: "Modell · OpenAI",
    hint: "Wenn Anbieter = openai",
    group: "Sprachmodell",
  },
  "llm.prompt_version": {
    label: "Prompt-Version",
    hint: "Rollback = alte Version setzen",
    group: "Sprachmodell",
  },
  "llm.max_known_lemmas": {
    label: "Bekannte Wörter im Prompt",
    hint: "Obergrenze der mitgeschickten Lernwörter",
    group: "Sprachmodell",
  },
  "pricing.premium_cents": { label: "Premium", hint: "Monatlich", group: "Preise", kind: "cents" },
  "pricing.tokens_10_cents": {
    label: "10 Tokens",
    hint: "Einmalkauf",
    group: "Preise",
    kind: "cents",
  },
  "pricing.tokens_50_cents": {
    label: "50 Tokens",
    hint: "Einmalkauf",
    group: "Preise",
    kind: "cents",
  },
  "pricing.premium_included_tokens": {
    label: "Tokens in Premium",
    hint: "Monatlich enthalten",
    group: "Preise",
  },
  maintenance: {
    label: "Wartungsmodus",
    hint: "App zeigt Hinweis, Generierung aus",
    group: "Betrieb",
  },
  "languages.enabled": {
    label: "Aktive Sprachpaare",
    hint: "Wird von der Seite „Sprachen“ gepflegt",
    group: "Betrieb",
  },
  announcements: {
    label: "Ankündigungen",
    hint: "[{ id, title, markdown, at }] – erscheinen im Postfach der App",
    group: "Betrieb",
  },
};
const GROUPS = ["Geschichten", "Sprachmodell", "Preise", "Betrieb", "Sonstige"];

function Limits() {
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({
    queryKey: ["app_settings"],
    queryFn: () => list<Setting>("app_settings"),
  });
  const grouped = GROUPS.map((g) => ({
    group: g,
    items: (settings.data ?? []).filter((s) => (META[s.key]?.group ?? "Sonstige") === g),
  })).filter((g) => g.items.length > 0);
  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["app_settings"] });
    toast.show("Gespeichert");
  };

  return (
    <Page
      title="Limits & Einstellungen"
      subtitle="App-weite Werte, versioniert – jede Änderung ist ein Audit-Eintrag und greift innerhalb von 30 Sekunden"
    >
      <div className="grid gap-4">
        {grouped.map((g) => (
          <Card key={g.group}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              {g.group}
            </div>
            <div className="divide-y divide-line">
              {g.items.map((s) => (
                <SettingRow key={s.key} s={s} onSaved={onSaved} />
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Toast msg={toast.msg} />
    </Page>
  );
}

function SettingRow({ s, onSaved }: { s: Setting; onSaved: () => void }) {
  const meta = META[s.key];
  const value = s.value_json;
  const simple =
    typeof value === "number" || typeof value === "string" || typeof value === "boolean";
  const [draft, setDraft] = useState<unknown>(value);
  const [json, setJson] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  const dirty = simple ? draft !== value : json !== JSON.stringify(value, null, 2);

  async function save() {
    try {
      const next = simple ? draft : JSON.parse(json);
      await apiPost("/admin/settings", { key: s.key, value_json: next });
      setErr(null);
      onSaved();
    } catch (e) {
      setErr(String(e));
    }
  }

  let control: React.ReactNode;
  if (typeof value === "boolean")
    control = <Switch checked={draft as boolean} onChange={(v) => setDraft(v)} />;
  else if (meta?.kind === "select")
    control = (
      <select
        className={`${input} w-auto`}
        value={String(draft)}
        onChange={(e) => setDraft(e.target.value)}
      >
        {meta.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  else if (typeof value === "number")
    control = (
      <div className="flex items-center gap-1">
        <input
          type="number"
          className={`${input} w-28 text-right`}
          value={draft as number}
          onChange={(e) => setDraft(Number(e.target.value))}
        />
        {meta?.kind === "cents" && (
          <span className="text-sm text-ink-3">ct = {((draft as number) / 100).toFixed(2)} €</span>
        )}
      </div>
    );
  else if (typeof value === "string")
    control = (
      <input
        className={`${input} w-56`}
        value={draft as string}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  else
    control = (
      <textarea
        className={cx(textarea, "w-full md:w-96")}
        rows={Math.min(8, json.split("\n").length + 1)}
        value={json}
        onChange={(e) => setJson(e.target.value)}
      />
    );

  return (
    <div className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="font-medium">{meta?.label ?? s.key}</div>
        <div className="text-xs text-ink-3">
          {meta?.hint ?? ""}
          {meta?.hint ? " · " : ""}
          <span className="font-mono">{s.key}</span> · v{s.version} · {s.updated_by} ·{" "}
          {fmtDate(s.updated_at)}
        </div>
        {err && <div className="mt-1 text-xs text-rose-deep">{err}</div>}
      </div>
      <div className="flex items-start gap-2">
        {control}
        <Button size="sm" disabled={!dirty} onClick={save}>
          Speichern
        </Button>
      </div>
    </div>
  );
}
