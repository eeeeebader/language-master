import type { StoryDocument } from "@lm/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { Badge, Button, Card, DataTable, input, Page, Toast, textarea } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";

export const Route = createFileRoute("/content/stories")({ component: Stories });

interface Row {
  id: string;
  language: string;
  title: string;
  theme: string;
  status: string;
  published_at: string | null;
}

function Stories() {
  const qc = useQueryClient();
  const toast = useToast();
  const rows = useQuery({
    queryKey: ["official_stories"],
    queryFn: () => list<Row>("official_stories"),
  });
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("daily_shopping");
  const [text, setText] = useState("");
  const [doc, setDoc] = useState<StoryDocument | null>(null);
  const [busy, setBusy] = useState(false);

  async function annotate() {
    setBusy(true);
    try {
      setDoc(
        await apiPost<StoryDocument>("/admin/stories/annotate", {
          language: "es",
          native: "de",
          title,
          theme,
          text,
        }),
      );
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!doc) return;
    await apiPost("/admin/stories/publish", { ...doc, status: "published" });
    setDoc(null);
    setText("");
    qc.invalidateQueries({ queryKey: ["official_stories"] });
    toast.show("Veröffentlicht");
  }
  const columns: ColumnDef<Row, unknown>[] = [
    { header: "Titel", accessorKey: "title" },
    { header: "Thema", accessorKey: "theme" },
    {
      header: "Status",
      cell: ({ row }) => (
        <Badge tone={row.original.status === "published" ? "sage" : "amber"}>
          {row.original.status}
        </Badge>
      ),
    },
    { header: "Veröffentlicht", cell: ({ row }) => fmtDate(row.original.published_at) },
  ];
  return (
    <Page
      title="Offizielle Texte"
      subtitle="Text einfügen → Pipeline-Schritte 4, 6, 7, 8 (spaCy, Grammatik-Notizen, Validierung, Moderation) → Vorschau → veröffentlichen"
    >
      <Card className="mb-4">
        <div className="mb-2 grid gap-2 md:grid-cols-2">
          <input
            className={input}
            placeholder="Titel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className={input}
            placeholder="Thema (enum)"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          />
        </div>
        <textarea
          className={textarea}
          rows={8}
          placeholder="Spanischer Text …"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button className="mt-2" disabled={!text.trim() || !title || busy} onClick={annotate}>
          {busy ? "…" : "Annotieren"}
        </Button>
      </Card>
      {doc && (
        <Card className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold">Vorschau: {doc.title}</span>
            <Button size="sm" onClick={publish}>
              Veröffentlichen
            </Button>
          </div>
          <div className="space-y-3 text-lg leading-loose">
            {doc.paragraphs.map((p, pi) => (
              <p key={`p${String(pi)}`}>
                {p.map((s) => (
                  <span key={s.id} title={s.translation}>
                    {s.tokens.map((t, i) => {
                      const span = doc.spans.find(
                        (sp) => sp.sentenceId === s.id && i >= sp.from && i < sp.to,
                      );
                      return (
                        <span key={`${s.id}-${String(i)}`}>
                          <span
                            className={span ? `grammar-${span.colour} rounded px-0.5` : ""}
                            title={span ? `${span.title}: ${span.note}` : t.lemma}
                          >
                            {t.text}
                          </span>
                          {t.ws}
                        </span>
                      );
                    })}{" "}
                  </span>
                ))}
              </p>
            ))}
          </div>
          <div className="mt-2 text-xs text-ink-3">
            {doc.spans.length} Grammatik-Spans · {doc.paragraphs.flat().length} Sätze
          </div>
        </Card>
      )}
      <DataTable data={rows.data ?? []} columns={columns} />
      <Toast msg={toast.msg} />
    </Page>
  );
}
