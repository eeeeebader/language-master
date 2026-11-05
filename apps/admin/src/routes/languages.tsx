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
  const pairs = useQuery({ queryKey: ["languages"], queryFn: () => list<Pair>("languages") });
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
