import { Lecture } from "@lm/schema";
import { LectureBlockView } from "@lm/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Page, Toast, textarea } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { useToast } from "@/lib/useToast";

export const Route = createFileRoute("/content/lectures")({ component: Lectures });

interface Row {
  id: string;
  language: string;
  slug: string;
  version: number;
  status: "draft" | "published";
  sort_order: number;
  title: string;
  content_json: unknown;
}

const EMPTY = {
  id: "es-new",
  language: "es",
  slug: "new",
  version: 1,
  title: { de: "Neue Lektion" },
  summary: { de: "" },
  minutes: 3,
  requires: [],
  offset: 0,
  blocks: [{ id: "b1", type: "prose", markdown: { de: "Text …" } }],
};

function Lectures() {
  const qc = useQueryClient();
  const toast = useToast();
  const rows = useQuery({ queryKey: ["lectures"], queryFn: () => list<Row>("lectures") });
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const row = rows.data?.find((r) => r.id === selected);
  const json = draft ?? JSON.stringify(row?.content_json ?? EMPTY, null, 2);
  const parsed = useMemo(() => {
    try {
      return Lecture.safeParse(JSON.parse(json));
    } catch (e) {
      return { success: false as const, error: { issues: [{ path: [], message: String(e) }] } };
    }
  }, [json]);

  async function save() {
    if (!parsed.success) return;
    await apiPost("/admin/lectures", { content_json: parsed.data });
    setDraft(null);
    qc.invalidateQueries({ queryKey: ["lectures"] });
    toast.show("Entwurf gespeichert");
  }
  async function publish() {
    if (!row) return;
    await apiPost(`/admin/lectures/${row.id}/publish`, {});
    qc.invalidateQueries({ queryKey: ["lectures"] });
    toast.show("Veröffentlicht");
  }
  async function reaudio() {
    if (!row) return;
    await apiPost(`/admin/lectures/${row.id}/render-audio`, {});
    toast.show("Audio-Job gestartet");
  }

  return (
    <Page
      title="Lektionen"
      subtitle="Block-Editor mit Live-Vorschau (dieselben Komponenten wie in der App), Entwurf/Veröffentlichung, Audio neu rendern"
      action={
        <Button
          variant="secondary"
          onClick={() => {
            setSelected(null);
            setDraft(JSON.stringify(EMPTY, null, 2));
          }}
        >
          Neu
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-[220px_1fr_1fr]">
        <Card className="p-2">
          {rows.data
            ?.sort((a, b) => a.sort_order - b.sort_order)
            .map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => {
                  setSelected(r.id);
                  setDraft(null);
                }}
                className={`flex w-full items-center justify-between rounded-chip px-3 py-2 text-left text-sm ${selected === r.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}
              >
                <span>
                  {r.title ??
                    (r.content_json as { title?: { de?: string } } | undefined)?.title?.de ??
                    r.slug}
                </span>
                <Badge tone={r.status === "published" ? "sage" : "amber"}>
                  {r.status === "published" ? `v${r.version}` : "draft"}
                </Badge>
              </button>
            ))}
        </Card>
        <Card>
          <textarea
            className={textarea}
            rows={28}
            value={json}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
          {!parsed.success && (
            <div className="mt-2 text-xs text-rose-deep">
              {parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ")}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={!parsed.success} onClick={save}>
              Entwurf speichern
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!row || row.status === "published"}
              onClick={publish}
            >
              Veröffentlichen
            </Button>
            <Button size="sm" variant="ghost" disabled={!row} onClick={reaudio}>
              Audio rendern
            </Button>
          </div>
        </Card>
        <Card>
          <div className="mb-2 text-xs uppercase tracking-wide text-ink-3">Vorschau</div>
          {parsed.success ? (
            <div className="space-y-3">
              <h2 className="text-xl font-extrabold">{parsed.data.title.de}</h2>
              {parsed.data.blocks.map((b) => (
                <LectureBlockView
                  key={b.id}
                  block={b}
                  onPlay={(t) => speechSynthesis.speak(new SpeechSynthesisUtterance(t))}
                />
              ))}
            </div>
          ) : (
            <div className="text-ink-3">Ungültiges JSON</div>
          )}
        </Card>
      </div>
      <Toast msg={toast.msg} />
    </Page>
  );
}
