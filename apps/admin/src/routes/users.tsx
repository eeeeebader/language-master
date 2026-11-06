import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { Badge, Button, Card, cx, DataTable, input, Page, Toast } from "@/components/ui";
import { apiGet, apiPost, list } from "@/lib/api";
import { fmtDate, useToast } from "@/lib/useToast";

export const Route = createFileRoute("/users")({ component: UsersPage });

interface User {
  id: string;
  username: string;
  email: string;
  native_language?: string;
  active_target_language: string;
  last_login_at: string;
  created_at?: string;
  is_premium: boolean;
  story_tokens: number;
  is_supporter: boolean;
  free_stories_per_day: number | null;
  consents: { document: string; version: number; accepted_at: string }[];
}

function UsersPage() {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const users = useQuery({
    queryKey: ["users", q],
    queryFn: async () => {
      // entitlements and consents hang off auth.users, not public.users, so they cannot be
      // embedded through PostgREST; merge them here.
      const [rows, ents, cons] = await Promise.all([
        list<User>("users", { search: q, column: "username" }),
        list<{
          user_id: string;
          is_premium: boolean;
          story_tokens: number;
          is_supporter: boolean;
          free_stories_per_day: number | null;
        }>("entitlements"),
        list<{ user_id: string; document: string; version: number; accepted_at: string }>(
          "consents",
        ),
      ]);
      const entByUser = new Map(ents.map((e) => [e.user_id, e]));
      return rows.map((u) => {
        const e = entByUser.get(u.id);
        return {
          ...u,
          is_premium: u.is_premium ?? e?.is_premium ?? false,
          story_tokens: u.story_tokens ?? e?.story_tokens ?? 0,
          is_supporter: u.is_supporter ?? e?.is_supporter ?? false,
          free_stories_per_day: u.free_stories_per_day ?? e?.free_stories_per_day ?? null,
          consents: u.consents ?? cons.filter((c) => c.user_id === u.id),
        };
      });
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });
  const open = users.data?.find((u) => u.id === openId) ?? null;

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
    {
      header: "Sprachen",
      cell: ({ row }) =>
        `${row.original.native_language ?? "de"} → ${row.original.active_target_language}`,
    },
    { header: "Letzter Login", cell: ({ row }) => fmtDate(row.original.last_login_at) },
    {
      header: "Tier",
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          {row.original.is_premium ? (
            <Badge tone="amber">Premium</Badge>
          ) : (
            <Badge tone="grey">Free</Badge>
          )}
          {row.original.is_supporter && <Badge tone="rose">Supporter</Badge>}
          {row.original.free_stories_per_day !== null && (
            <Badge tone="sky">{row.original.free_stories_per_day} frei/Tag</Badge>
          )}
        </span>
      ),
    },
    { header: "Tokens", accessorKey: "story_tokens" },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" variant="secondary" onClick={() => setOpenId(row.original.id)}>
          Verwalten
        </Button>
      ),
    },
  ];

  return (
    <Page
      title="Users"
      subtitle="Suche, Tier, Supporter-Badge, freie Geschichten, Tokens, Export und Löschung (DSGVO Art. 15/17)"
    >
      <input
        className={`${input} mb-3 max-w-md`}
        placeholder="Benutzername oder E-Mail …"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={cx("grid gap-4", open && "lg:grid-cols-[1fr_380px]")}>
        <DataTable data={users.data ?? []} columns={columns} />
        {open && (
          <UserPanel
            key={open.id}
            u={open}
            onClose={() => setOpenId(null)}
            onChanged={(msg) => {
              toast.show(msg);
              refresh();
            }}
          />
        )}
      </div>
      <Toast msg={toast.msg} />
    </Page>
  );
}

/** Everything an admin grants by hand, with inputs instead of prompts. */
function UserPanel({
  u,
  onClose,
  onChanged,
}: {
  u: User;
  onClose: () => void;
  onChanged: (msg: string) => void;
}) {
  const [premium, setPremium] = useState(u.is_premium);
  const [supporter, setSupporter] = useState(u.is_supporter);
  const [free, setFree] = useState<string>(u.free_stories_per_day?.toString() ?? "");
  const [delta, setDelta] = useState("10");
  const [reason, setReason] = useState("Tester");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPremium(u.is_premium);
    setSupporter(u.is_supporter);
    setFree(u.free_stories_per_day?.toString() ?? "");
  }, [u]);
  const dirty =
    premium !== u.is_premium ||
    supporter !== u.is_supporter ||
    (free === "" ? null : Number(free)) !== u.free_stories_per_day;

  async function saveEntitlements() {
    setBusy(true);
    try {
      await apiPost(`/admin/users/${u.id}/entitlements`, {
        is_premium: premium,
        is_supporter: supporter,
        free_stories_per_day: free === "" ? null : Math.max(0, Math.min(100, Number(free))),
      });
      onChanged("Berechtigungen gespeichert");
    } finally {
      setBusy(false);
    }
  }
  async function grant() {
    const n = Number(delta);
    if (!n || !reason.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/admin/users/${u.id}/grant-tokens`, { delta: n, reason: reason.trim() });
      onChanged(`${n > 0 ? "+" : ""}${n} Tokens gebucht`);
    } finally {
      setBusy(false);
    }
  }
  async function exportUser() {
    const data = await apiGet(`/admin/users/${u.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `export-${u.id}.json`;
    a.click();
  }
  async function del() {
    if (
      !confirm(
        `Konto ${u.username} (${u.email}) endgültig löschen? (DSGVO Art. 17; Rechnungsdaten bleiben pseudonymisiert 10 Jahre)`,
      )
    )
      return;
    await apiPost(`/admin/users/${u.id}/delete`, { reason: "gdpr_request" });
    onChanged("Konto gelöscht");
    onClose();
  }

  return (
    <Card className="self-start">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-bold">{u.username}</div>
          <div className="text-xs text-ink-3">{u.email}</div>
          <div className="mt-1 text-xs text-ink-3">
            Registriert {u.created_at ? fmtDate(u.created_at) : "–"} · zuletzt{" "}
            {fmtDate(u.last_login_at)}
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Schließen
        </Button>
      </div>

      <section className="mb-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Berechtigungen
        </div>
        <Row label="Premium" hint="Alle Premium-Funktionen, Quelle „admin_grant“">
          <Switch checked={premium} onChange={setPremium} />
        </Row>
        <Row label="Supporter-Badge" hint="Sichtbar im Profil und später bei Freunden">
          <Switch checked={supporter} onChange={setSupporter} />
        </Row>
        <Row label="Freie Geschichten / Tag" hint="Leer = App-Einstellung (stories.free_per_day)">
          <input
            type="number"
            min={0}
            max={100}
            className={`${input} w-24 text-right`}
            value={free}
            placeholder="Std."
            onChange={(e) => setFree(e.target.value)}
          />
        </Row>
        <Button size="sm" className="mt-2" disabled={!dirty || busy} onClick={saveEntitlements}>
          Speichern
        </Button>
      </section>

      <section className="mb-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Tokens · aktuell {u.story_tokens}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            className={`${input} w-24 text-right`}
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            aria-label="Token-Differenz"
          />
          <input
            className={`${input} min-w-0 flex-1`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Grund (Audit)"
          />
          <Button size="sm" variant="secondary" disabled={busy || !Number(delta)} onClick={grant}>
            Buchen
          </Button>
        </div>
        <div className="mt-1 text-xs text-ink-3">Negativ = abziehen · landet im token_ledger</div>
      </section>

      <section className="mb-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Consents
        </div>
        <div className="text-sm">
          {(u.consents ?? []).length === 0
            ? "–"
            : u.consents.map((c) => (
                <div key={`${c.document}-${c.version}`}>
                  {c.document} v{c.version}{" "}
                  <span className="text-ink-3">· {fmtDate(c.accepted_at)}</span>
                </div>
              ))}
        </div>
      </section>

      <div className="flex gap-2 border-t border-line pt-3">
        <Button size="sm" variant="secondary" onClick={exportUser}>
          Export (Art. 15)
        </Button>
        <Button size="sm" variant="danger" onClick={del}>
          Löschen (Art. 17)
        </Button>
      </div>
    </Card>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-sage-deep" : "bg-line",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
