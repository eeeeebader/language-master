import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Page({
  title,
  children,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="mb-5 flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-ink-2">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

export function Card({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: "sage" | "rose" | "lavender" | "amber" | "sky";
}) {
  const tones = {
    sage: "bg-sage-soft",
    rose: "bg-rose-soft",
    lavender: "bg-lavender-soft",
    amber: "bg-amber-soft",
    sky: "bg-sky-soft",
  };
  return (
    <div
      className={cx(
        "rounded-card border border-line bg-white/70 p-4",
        tone && cx(tones[tone], "border-transparent"),
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "sage" | "rose" | "lavender" | "amber" | "sky";
}) {
  return (
    <Card tone={tone}>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="text-sm text-ink-2">{label}</div>
    </Card>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const V: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/90",
  secondary: "bg-paper-2 text-ink hover:bg-line",
  danger: "bg-rose-soft text-rose-deep hover:bg-rose/60",
  ghost: "text-ink-2 hover:bg-paper-2",
};
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center gap-1.5 rounded-chip font-semibold transition-colors disabled:opacity-40",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2",
        V[variant],
        className,
      )}
      {...p}
    />
  );
}

export const input =
  "w-full rounded-chip border border-line bg-white px-3 py-2 outline-none focus:border-ink";
export const textarea =
  "w-full rounded-card border border-line bg-white px-3 py-2 font-mono text-sm outline-none focus:border-ink";

export function Badge({
  children,
  tone = "sage",
}: {
  children: ReactNode;
  tone?: "sage" | "rose" | "lavender" | "amber" | "sky" | "grey";
}) {
  const t = {
    sage: "bg-sage-soft text-sage-deep",
    rose: "bg-rose-soft text-rose-deep",
    lavender: "bg-lavender-soft text-lavender-deep",
    amber: "bg-amber-soft text-amber-deep",
    sky: "bg-sky-soft text-sky-deep",
    grey: "bg-paper-2 text-ink-2",
  };
  return (
    <span className={cx("rounded-chip px-2 py-0.5 text-xs font-semibold", t[tone])}>
      {children}
    </span>
  );
}

export function DataTable<T>({ data, columns }: { data: T[]; columns: ColumnDef<T, unknown>[] }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white/70">
      <table className="w-full text-sm">
        <thead className="bg-paper-2 text-left text-xs uppercase tracking-wide text-ink-2">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="px-3 py-2 font-semibold">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-line">
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className="hover:bg-paper-2/60">
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-3 py-2 align-top">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-ink-3">
                Keine Einträge
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-chip bg-ink px-4 py-2 text-sm text-paper">
      {msg}
    </div>
  );
}
