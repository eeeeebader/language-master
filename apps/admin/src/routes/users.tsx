import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { Badge, Button, DataTable, input, Page, Toast } from "@/components/ui";
import { apiGet, apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";

export const Route = createFileRoute("/users")({ component: UsersPage });

interface User {
  id: string;
  username: string;
  email: string;
  active_target_language: string;
  last_login_at: string;
  is_premium: boolean;
  story_tokens: number;
  is_supporter: boolean;
  consents: { document: string; version: number; accepted_at: string }[];
}

function UsersPage() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const users = useQuery({
    queryKey: ["users", q],
    queryFn: () => list<User>("users", { search: q, column: "username" }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  async function grant(u: User) {
    const delta = Number(
      prompt(`Tokens für ${u.username} gutschreiben (negativ = abziehen):`, "10"),
    );
    if (!delta) return;
    await apiPost(`/admin/users/${u.id}/grant-tokens`, { delta, reason: "grant" });
    toast.show("Tokens gebucht");
    refresh();
  }
  async function exportUser(u: User) {
    const data = await apiGet(`/admin/users/${u.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `export-${u.id}.json`;
    a.click();
  }
  async function del(u: User) {
    if (
      !confirm(
        `Konto ${u.username} (${u.email}) endgültig löschen? (DSGVO Art. 17; Rechnungsdaten bleiben pseudonymisiert 10 Jahre)`,
      )
    )
      return;
    await apiPost(`/admin/users/${u.id}/delete`, { reason: "gdpr_request" });
    toast.show("Konto gelöscht");
    refresh();
  }

  const columns: ColumnDef<User, unknown>[] = [
    {
      header: "User",
      cell: ({ row }) => (
        <div>
          <div className="font-semibold">{row.original.username}</div>
          <div className="text-xs text-ink-3">{row.original.email}</div>
        </div>
      ),
    },
    { header: "Sprache", accessorKey: "active_target_language" },
    { header: "Letzter Login", cell: ({ row }) => fmtDate(row.original.last_login_at) },
    {
      header: "Tier",
      cell: ({ row }) => (
        <span className="flex gap-1">
          {row.original.is_premium ? (
            <Badge tone="amber">Premium</Badge>
          ) : (
            <Badge tone="grey">Free</Badge>
          )}
          {row.original.is_supporter && <Badge tone="rose">Supporter</Badge>}
        </span>
      ),
    },
    { header: "Tokens", accessorKey: "story_tokens" },
    {
      header: "Consents",
      cell: ({ row }) =>
        row.original.consents.map((c) => `${c.document} v${c.version}`).join(", ") || "–",
    },
    {
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={() => grant(row.original)}>
            Tokens
          </Button>
          <Button size="sm" variant="secondary" onClick={() => exportUser(row.original)}>
            Export
          </Button>
          <Button size="sm" variant="danger" onClick={() => del(row.original)}>
            Löschen
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Page
      title="Users"
      subtitle="Suche, Tier, Tokens, Consents, Export und Löschung (DSGVO Art. 15/17)"
    >
      <input
        className={`${input} mb-3 max-w-md`}
        placeholder="Benutzername oder E-Mail …"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <DataTable data={users.data ?? []} columns={columns} />
      <Toast msg={toast.msg} />
    </Page>
  );
}
