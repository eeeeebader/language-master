import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, Button, DataTable, Page, Toast } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { useToast } from "@/lib/useToast";

export const Route = createFileRoute("/languages")({ component: Languages });

interface Pair {
  target: string;
  native: string;
  enabled: boolean;
  pack_version: number | null;
  published_lectures: number;
}

function Languages() {
  const qc = useQueryClient();
  const toast = useToast();
  const pairs = useQuery({
    queryKey: ["languages"],
    queryFn: async () => {
      // readiness is derived: newest published pack and count of published lecture slugs per pair
      const [rows, packs, lectures] = await Promise.all([
        list<Pair>("languages"),
        list<{
          target: string;
          native: string;
          version: number;
          published_at: string | null;
          with_audio: boolean;
        }>("dictionary_packs"),
        list<{ language: string; slug: string; status: string }>("lectures"),
      ]);
      return rows.map((r) => {
        const published = packs.filter(
          (p) => p.target === r.target && p.native === r.native && p.published_at && !p.with_audio,
        );
        const slugs = new Set(
          lectures
            .filter((l) => l.language === r.target && l.status === "published")
            .map((l) => l.slug),
        );
        return {
          ...r,
          pack_version:
            r.pack_version ??
            (published.length ? Math.max(...published.map((p) => p.version)) : null),
          published_lectures: r.published_lectures ?? slugs.size,
        };
      });
    },
  });
  const ready = (p: Pair) => p.pack_version !== null && p.published_lectures >= 8;
  const columns: ColumnDef<Pair, unknown>[] = [
    { header: "Paar", cell: ({ row }) => `${row.original.target} → ${row.original.native}` },
    {
      header: "Pack",
      cell: ({ row }) =>
        row.original.pack_version ? (
          `v${row.original.pack_version}`
        ) : (
          <Badge tone="rose">fehlt</Badge>
        ),
    },
    { header: "Lektionen", cell: ({ row }) => `${row.original.published_lectures} / 8` },
    {
      header: "Status",
      cell: ({ row }) => (
        <Badge tone={row.original.enabled ? "sage" : "grey"}>
          {row.original.enabled ? "aktiv" : "aus"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant={row.original.enabled ? "secondary" : "primary"}
          disabled={!row.original.enabled && !ready(row.original)}
          onClick={async () => {
            await apiPost("/admin/languages", {
              target: row.original.target,
              native: row.original.native,
              enabled: !row.original.enabled,
            });
            qc.invalidateQueries({ queryKey: ["languages"] });
            toast.show("Gespeichert");
          }}
        >
          {row.original.enabled ? "Deaktivieren" : "Aktivieren"}
        </Button>
      ),
    },
  ];
  return (
    <Page
      title="Sprachen"
      subtitle="Ein Paar geht live, sobald Pack und mindestens 8 Lektionen veröffentlicht sind"
    >
      <DataTable data={pairs.data ?? []} columns={columns} />
      <Toast msg={toast.msg} />
    </Page>
  );
}
