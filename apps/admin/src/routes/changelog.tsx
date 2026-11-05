import { Markdownish } from "@lm/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, input, Page, Toast, textarea } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";

export const Route = createFileRoute("/changelog")({ component: Changelog });

interface Entry {
  id: string;
  version: string;
  locale: string;
  markdown: string;
  published_at: string;
}

function Changelog() {
  const qc = useQueryClient();
  const toast = useToast();
  const entries = useQuery({ queryKey: ["changelog"], queryFn: () => list<Entry>("changelog") });
  const [version, setVersion] = useState("");
  const [md, setMd] = useState("");
  async function publish() {
    await apiPost("/admin/changelog", { version, locale: "de", markdown: md });
    setVersion("");
    setMd("");
    qc.invalidateQueries({ queryKey: ["changelog"] });
    toast.show("Eintrag veröffentlicht – erscheint in der App-Inbox und auf der Website");
  }
  return (
    <Page
      title="Changelog"
      subtitle="Markdown pro Version; in der App unter Einstellungen und auf der Website"
    >
      <Card className="mb-4">
        <input
          className={`${input} mb-2 max-w-xs`}
          placeholder="Version, z. B. 0.2.0"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
        <textarea
          className={textarea}
          rows={6}
          placeholder="Was ist neu?"
          value={md}
          onChange={(e) => setMd(e.target.value)}
        />
        <Button className="mt-2" disabled={!version || !md} onClick={publish}>
          Veröffentlichen
        </Button>
      </Card>
      <div className="space-y-3">
        {entries.data?.map((e) => (
          <Card key={e.id}>
            <div className="flex items-baseline gap-2">
              <span className="font-extrabold">v{e.version}</span>
              <span className="text-xs text-ink-3">
                {fmtDate(e.published_at)} · {e.locale}
              </span>
            </div>
            <Markdownish text={e.markdown} />
          </Card>
        ))}
      </div>
      <Toast msg={toast.msg} />
    </Page>
  );
}
