import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, Page } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { fmtDate } from "@/lib/useToast";

export const Route = createFileRoute("/audit")({ component: Audit });

interface Row {
  actor: string;
  table: string;
  row_id: string;
  before: unknown;
  after: unknown;
  at: string;
}

function Audit() {
  const rows = useQuery({
    queryKey: ["audit"],
    queryFn: () => apiGet<Row[]>("/admin/audit"),
    refetchInterval: 10_000,
  });
  const columns: ColumnDef<Row, unknown>[] = [
    { header: "Zeit", cell: ({ row }) => fmtDate(row.original.at) },
    { header: "Akteur", accessorKey: "actor" },
    { header: "Tabelle", accessorKey: "table" },
    { header: "Zeile", accessorKey: "row_id" },
    {
      header: "Diff",
      cell: ({ row }) => (
        <pre className="max-w-xl whitespace-pre-wrap text-xs text-ink-2">
          {JSON.stringify(
            { before: row.original.before, after: row.original.after },
            null,
            1,
          ).slice(0, 600)}
        </pre>
      ),
    },
  ];
  return (
    <Page
      title="Audit-Log"
      subtitle="Jeder Admin-Schreibzugriff: actor, table, row_id, before, after, at"
    >
      <DataTable data={rows.data ?? []} columns={columns} />
    </Page>
  );
}
