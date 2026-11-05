import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { Button, Card, DataTable, input, Page, Toast, textarea } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";

export const Route = createFileRoute("/content/dictionary")({ component: Dictionary });

interface Pack {
  id: string;
  target: string;
  native: string;
  version: number;
  url: string;
  bytes: number;
  sha256: string;
  with_audio: boolean;
  published_at: string | null;
}
interface Override {
  id: string;
  language: string;
  lemma: string;
  patch: unknown;
  updated_by: string;
  updated_at: string;
}

function Dictionary() {
  const qc = useQueryClient();
  const toast = useToast();
  const packs = useQuery({
    queryKey: ["dictionary_packs"],
    queryFn: () => list<Pack>("dictionary_packs"),
  });
  const overrides = useQuery({
    queryKey: ["lemma_overrides"],
    queryFn: () => list<Override>("lemma_overrides"),
  });
  const [lemma, setLemma] = useState("");
  const [patch, setPatch] = useState('{ "glosses": [{ "text": "" }] }');

  async function build() {
    await apiPost("/admin/dictionary/build", { target: "es", native: "de" });
    qc.invalidateQueries({ queryKey: ["jobs"] });
    toast.show("Pack-Build gestartet (siehe Jobs)");
  }
  async function saveOverride() {
    await apiPost("/admin/dictionary/override", {
      language: "es",
      lemma,
      patch: JSON.parse(patch),
    });
    setLemma("");
    qc.invalidateQueries({ queryKey: ["lemma_overrides"] });
    toast.show("Override gespeichert – wirkt beim nächsten Build");
  }

  const packCols: ColumnDef<Pack, unknown>[] = [
    { header: "Pair", cell: ({ row }) => `${row.original.target}-${row.original.native}` },
    { header: "Version", accessorKey: "version" },
    { header: "Größe", cell: ({ row }) => `${(row.original.bytes / 1_000_000).toFixed(1)} MB` },
    { header: "Audio", cell: ({ row }) => (row.original.with_audio ? "ja" : "nein") },
    {
      header: "SHA-256",
      cell: ({ row }) => <code className="text-xs">{row.original.sha256.slice(0, 12)}…</code>,
    },
    { header: "Veröffentlicht", cell: ({ row }) => fmtDate(row.original.published_at) },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        !row.original.published_at ? (
          <Button
            size="sm"
            onClick={async () => {
              await apiPost(`/admin/dictionary/${row.original.id}/publish`, {});
              qc.invalidateQueries({ queryKey: ["dictionary_packs"] });
            }}
          >
            Publish
          </Button>
        ) : null,
    },
  ];
  const ovCols: ColumnDef<Override, unknown>[] = [
    { header: "Lemma", accessorKey: "lemma" },
    {
      header: "Patch",
      cell: ({ row }) => <code className="text-xs">{JSON.stringify(row.original.patch)}</code>,
    },
    { header: "Von", accessorKey: "updated_by" },
    { header: "Am", cell: ({ row }) => fmtDate(row.original.updated_at) },
  ];

  return (
    <Page
      title="Wörterbuch"
      subtitle="Pack-Builds aus Wiktionary (Kaikki) + kuratierte Overrides; Veröffentlichung einer neuen Pack-Version"
      action={<Button onClick={build}>Pack bauen (es-de)</Button>}
    >
      <DataTable data={packs.data ?? []} columns={packCols} />
      <h2 className="mb-2 mt-6 font-bold">Overrides pro Lemma</h2>
      <Card className="mb-3">
        <div className="grid gap-2 md:grid-cols-[200px_1fr_auto]">
          <input
            className={input}
            placeholder="Lemma"
            value={lemma}
            onChange={(e) => setLemma(e.target.value)}
          />
          <textarea
            className={textarea}
            rows={2}
            value={patch}
            onChange={(e) => setPatch(e.target.value)}
          />
          <Button disabled={!lemma} onClick={saveOverride}>
            Speichern
          </Button>
        </div>
        <p className="mt-1 text-xs text-ink-3">
          Patch-Felder wie DictionaryEntry: glosses, gender, article, plural, genderPair, examples,
          tags, frequencyRank.
        </p>
      </Card>
      <DataTable data={overrides.data ?? []} columns={ovCols} />
      <Toast msg={toast.msg} />
    </Page>
  );
}
