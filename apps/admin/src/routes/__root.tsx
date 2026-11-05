import {
  Books,
  ChartBar,
  CurrencyEur,
  Flag,
  Gavel,
  Gear,
  GlobeHemisphereWest,
  ListChecks,
  Notebook,
  Path,
  Scroll,
  Translate,
  Users,
} from "@phosphor-icons/react";
import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Button, cx } from "@/components/ui";
import { setToken } from "@/lib/api";
import { canAccess, useAdminSession } from "@/lib/auth";
import { MOCK_MODE } from "@/lib/supabase";

export const Route = createRootRoute({ component: Root });

const NAV: { to: string; module: string; label: string; Icon: typeof Users; group: string }[] = [
  { to: "/users", module: "users", label: "Users", Icon: Users, group: "Betrieb" },
  { to: "/limits", module: "limits", label: "Limits", Icon: Gear, group: "Betrieb" },
  { to: "/legal", module: "legal", label: "Legal", Icon: Gavel, group: "Betrieb" },
  { to: "/changelog", module: "changelog", label: "Changelog", Icon: Scroll, group: "Betrieb" },
  { to: "/jobs", module: "jobs", label: "Jobs", Icon: ListChecks, group: "Betrieb" },
  {
    to: "/content/lectures",
    module: "content/lectures",
    label: "Lektionen",
    Icon: Path,
    group: "Inhalte",
  },
  {
    to: "/content/dictionary",
    module: "content/dictionary",
    label: "Wörterbuch",
    Icon: Translate,
    group: "Inhalte",
  },
  {
    to: "/content/stories",
    module: "content/stories",
    label: "Offizielle Texte",
    Icon: Books,
    group: "Inhalte",
  },
  {
    to: "/languages",
    module: "languages",
    label: "Sprachen",
    Icon: GlobeHemisphereWest,
    group: "Inhalte",
  },
  { to: "/finance", module: "finance", label: "Finanzen", Icon: CurrencyEur, group: "Zahlen" },
  { to: "/analytics", module: "analytics", label: "Analytics", Icon: ChartBar, group: "Zahlen" },
  { to: "/flags", module: "flags", label: "Feature Flags", Icon: Flag, group: "Zahlen" },
  { to: "/audit", module: "jobs", label: "Audit-Log", Icon: Notebook, group: "Zahlen" },
];

function Root() {
  const { session, loading, signIn, signOut } = useAdminSession();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState("");
  if (loading) return <div className="p-10 text-ink-3">…</div>;
  if (!session) {
    return (
      <div className="mx-auto mt-24 max-w-sm rounded-card border border-line bg-white p-6">
        <h1 className="text-xl font-extrabold">Language Master Admin</h1>
        <p className="mt-1 text-sm text-ink-2">
          Magic Link für Admin-Konten. Konten werden von Hand angelegt, 2FA (TOTP) ist Pflicht.
        </p>
        <input
          className="mt-4 w-full rounded-chip border border-line px-3 py-2"
          placeholder="admin@…"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button className="mt-3 w-full" onClick={() => signIn(email)}>
          Link senden
        </Button>
      </div>
    );
  }
  setToken(session.token);
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <div className="flex min-h-dvh">
      <aside className="w-60 shrink-0 border-r border-line bg-paper-2/60 px-3 py-5">
        <Link to="/" className="block px-2 text-lg font-extrabold tracking-tight">
          LM Admin
        </Link>
        <div className="px-2 text-xs text-ink-3">
          {session.email} · {session.role}
          {!session.mfaVerified && <span className="ml-1 text-rose-deep">· 2FA fehlt</span>}
        </div>
        {MOCK_MODE && (
          <div className="mx-2 mt-2 rounded-chip bg-amber-soft px-2 py-1 text-center text-xs font-semibold text-amber-deep">
            MOCK-MODUS · keine Supabase-URL
          </div>
        )}
        {groups.map((g) => (
          <div key={g} className="mt-5">
            <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              {g}
            </div>
            {NAV.filter((n) => n.group === g).map(({ to, module, label, Icon }) => {
              const allowed = canAccess(session.role, module);
              const active = path.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  disabled={!allowed}
                  className={cx(
                    "mt-0.5 flex items-center gap-2 rounded-chip px-2 py-1.5 text-sm",
                    active ? "bg-ink text-paper" : "hover:bg-white",
                    !allowed && "pointer-events-none opacity-40",
                  )}
                >
                  <Icon size={16} /> {label}
                </Link>
              );
            })}
          </div>
        ))}
        <Button variant="ghost" size="sm" className="mt-6" onClick={signOut}>
          Abmelden
        </Button>
      </aside>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
