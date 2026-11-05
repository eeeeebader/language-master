import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, Button, DataTable, Page, Toast } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";

export const Route = createFileRoute("/jobs")({ component: Jobs });

interface Job {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  status: "ok" | "failed" | "running";
  summary: string;
}

function Jobs() {
  const qc = useQueryClient();
  const toast = useToast();
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => list<Job>("jobs"),
    refetchInterval: 15_000,
  });
  const columns: ColumnDef<Job, unknown>[] = [
    { header: "Job", accessorKey: "name" },
    {
      header: "Status",
      cell: ({ row }) => (
        <Badge
          tone={
            row.original.status === "ok"
              ? "sage"
              : row.original.status === "failed"
                ? "rose"
                : "amber"
          }
        >
          {row.original.status}
        </Badge>
      ),
    },
    { header: "Start", cell: ({ row }) => fmtDate(row.original.started_at) },
    { header: "Ende", cell: ({ row }) => fmtDate(row.original.finished_at) },
    { header: "Zusammenfassung", accessorKey: "summary" },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        row.original.status === "failed" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await apiPost(`/admin/jobs/${row.original.id}/retry`, {});
              qc.invalidateQueries({ queryKey: ["jobs"] });
              toast.show("Erneut gestartet");
            }}
          >
            Retry
          </Button>
        ) : null,
    },
  ];
  return (
    <Page
      title="Jobs"
      subtitle="Retention-Cron, Pack-Builds, fehlgeschlagene Webhooks; idempotent, mit Retry"
    >
      <DataTable data={jobs.data ?? []} columns={columns} />
      <Toast msg={toast.msg} />
    </Page>
  );
}
