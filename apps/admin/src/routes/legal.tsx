import { Markdownish } from "@lm/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Card, Page, Toast, textarea } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";

export const Route = createFileRoute("/legal")({ component: Legal });

interface Doc {
  id: string;
  document: "agb" | "privacy" | "impressum";
  locale: string;
  version: number;
  markdown: string;
  published_at: string;
  requires_reconsent: boolean;
}

function Legal() {
  const qc = useQueryClient();
  const toast = useToast();
  const docs = useQuery({
    queryKey: ["legal_documents"],
    queryFn: () => list<Doc>("legal_documents"),
  });
  const [kind, setKind] = useState<Doc["document"]>("agb");
  const [locale, setLocale] = useState("de");
  const versions = (docs.data ?? [])
    .filter((d) => d.document === kind && d.locale === locale)
    .sort((a, b) => b.version - a.version);
  const latest = versions[0];
  const [md, setMd] = useState<string | null>(null);
  const [reconsent, setReconsent] = useState(false);
  const text = md ?? latest?.markdown ?? "";

  async function publish() {
    await apiPost("/admin/legal", {
      document: kind,
      locale,
      markdown: text,
      requires_reconsent: reconsent,
    });
    setMd(null);
    qc.invalidateQueries({ queryKey: ["legal_documents"] });
    toast.show(reconsent ? "Veröffentlicht – alle Nutzer müssen neu zustimmen" : "Veröffentlicht");
  }

  return (
    <Page
      title="Legal"
      subtitle="AGB, Datenschutz, Impressum: versioniert; eine neue AGB-Version kann Re-Consent erzwingen"
    >
      <div className="mb-3 flex gap-2">
        {(["agb", "privacy", "impressum"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "primary" : "secondary"}
            onClick={() => {
              setKind(k);
              setMd(null);
            }}
          >
            {k}
          </Button>
        ))}
        <select
          className="rounded-chip border border-line bg-white px-3"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        >
          <option value="de">de</option>
          <option value="en">en</option>
        </select>
        <span className="ml-auto text-sm text-ink-3">
          {latest
            ? `aktuell v${latest.version} · ${fmtDate(latest.published_at)}`
            : "noch keine Version"}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <textarea
            className={textarea}
            rows={24}
            value={text}
            onChange={(e) => setMd(e.target.value)}
          />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reconsent}
              onChange={(e) => setReconsent(e.target.checked)}
            />{" "}
            Erneute Zustimmung beim nächsten Login verlangen
          </label>
          <Button className="mt-2" onClick={publish} disabled={!text.trim()}>
            Als v{(latest?.version ?? 0) + 1} veröffentlichen
          </Button>
        </Card>
        <Card>
          <div className="mb-2 text-xs uppercase tracking-wide text-ink-3">Vorschau</div>
          <Markdownish text={text} />
        </Card>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {versions.map((v) => (
          <Badge key={v.id} tone={v.requires_reconsent ? "rose" : "grey"}>
            v{v.version} · {fmtDate(v.published_at)}
            {v.requires_reconsent ? " · Re-Consent" : ""}
          </Badge>
        ))}
      </div>
      <Toast msg={toast.msg} />
    </Page>
  );
}
