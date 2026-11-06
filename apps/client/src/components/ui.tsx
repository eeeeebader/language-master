import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/90 active:scale-[0.98]",
  secondary: "bg-paper-2 text-ink hover:bg-line active:scale-[0.98]",
  ghost: "bg-transparent text-ink-2 hover:bg-paper-2",
  danger: "bg-rose-soft text-rose-deep hover:bg-rose/60",
};

export function Button({
  variant = "primary",
  className,
  full,
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  full?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5", lg: "px-5 py-3.5 text-lg" };
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-chip font-semibold transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none",
        VARIANTS[variant],
        sizes[size],
        full && "w-full",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
  onClick,
  tone,
  testId,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  tone?: "sage" | "rose" | "lavender" | "amber" | "sky";
  testId?: string;
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
      onClick={onClick}
      data-testid={testId}
      className={cx(
        "rounded-card border border-line bg-white/70 p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)]",
        tone && tones[tone],
        onClick && "cursor-pointer active:scale-[0.99] transition-transform",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  tone,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  tone?: "sage" | "rose" | "lavender" | "amber" | "sky";
  className?: string;
}) {
  const tones = {
    sage: "bg-sage-soft text-sage-deep",
    rose: "bg-rose-soft text-rose-deep",
    lavender: "bg-lavender-soft text-lavender-deep",
    amber: "bg-amber-soft text-amber-deep",
    sky: "bg-sky-soft text-sky-deep",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-chip px-3 py-1.5 text-sm font-medium transition-colors border",
        active
          ? "bg-ink text-paper border-ink"
          : tone
            ? cx(tones[tone], "border-transparent")
            : "bg-white/70 border-line text-ink-2 hover:bg-paper-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-ink-2">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-chip transition-colors",
          checked ? "bg-sage-deep" : "bg-line",
        )}
      >
        <span
          className={cx(
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "left-6" : "left-1",
          )}
        />
      </button>
    </label>
  );
}

export function ProgressBar({
  parts,
}: {
  parts: { value: number; colour: "sage" | "rose" | "lavender" | "amber" | "sky" | "line" }[];
}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const bg = {
    sage: "bg-sage",
    rose: "bg-rose",
    lavender: "bg-lavender",
    amber: "bg-amber",
    sky: "bg-sky",
    line: "bg-line",
  };
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-chip bg-paper-2">
      {parts.map((p, i) => (
        <div
          key={`${p.colour}-${i}`}
          className={cx(bg[p.colour], "transition-all duration-500")}
          style={{ width: `${(p.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-[1.5rem] bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl animate-pop max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-chip bg-line" />
        {title && <h3 className="mb-3 text-lg font-bold">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Page({
  title,
  children,
  action,
  back,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
      {(title || action || back) && (
        <header className="mb-4 flex items-center gap-3">
          {back}
          {title && <h1 className="flex-1 text-2xl font-extrabold tracking-tight">{title}</h1>}
          {action}
        </header>
      )}
      {children}
    </main>
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
    <Card tone={tone} className="border-transparent">
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="text-sm text-ink-2">{label}</div>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line p-6 text-center text-ink-2">
      {children}
    </div>
  );
}

export function Markdownish({ text }: { text: string }) {
  // Minimal: **bold**, headings, paragraphs. Enough for lecture prose and legal texts.
  const lines = text.split("\n");
  return (
    <div className="space-y-2 leading-relaxed">
      {lines.map((line, i) => {
        const key = `${i}-${line.slice(0, 12)}`;
        if (line.startsWith("# "))
          return (
            <h1 key={key} className="text-2xl font-extrabold">
              {line.slice(2)}
            </h1>
          );
        if (line.startsWith("## "))
          return (
            <h2 key={key} className="mt-4 text-lg font-bold">
              {line.slice(3)}
            </h2>
          );
        if (!line.trim()) return null;
        const bullet = line.startsWith("- ");
        const body = bullet ? line.slice(2) : line;
        const parts = body.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
        const inline = parts.map((p, j) =>
          p.startsWith("**") ? (
            <strong key={`${key}-${j}`}>{p.slice(2, -2)}</strong>
          ) : p.startsWith("*") ? (
            <em key={`${key}-${j}`}>{p.slice(1, -1)}</em>
          ) : (
            <span key={`${key}-${j}`}>{p}</span>
          ),
        );
        return bullet ? (
          <p key={key} className="flex gap-2 pl-1">
            <span className="text-ink-3">•</span>
            <span>{inline}</span>
          </p>
        ) : (
          <p key={key}>{inline}</p>
        );
      })}
    </div>
  );
}
