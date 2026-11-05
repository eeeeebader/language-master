import type { GrammarColour } from "@lm/schema";
import type { ReactNode } from "react";
import { cx } from "../cx";

export const COLOUR_BG: Record<GrammarColour, string> = {
  sage: "bg-sage-soft",
  rose: "bg-rose-soft",
  lavender: "bg-lavender-soft",
  amber: "bg-amber-soft",
  sky: "bg-sky-soft",
};
export const COLOUR_TX: Record<GrammarColour, string> = {
  sage: "text-sage-deep",
  rose: "text-rose-deep",
  lavender: "text-lavender-deep",
  amber: "text-amber-deep",
  sky: "text-sky-deep",
};

export type OnPlay = (text: string) => void;

export function AudioButton({
  text,
  onPlay,
  size = 16,
  label = "Aussprache",
}: {
  text: string;
  onPlay?: OnPlay;
  size?: number;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center text-sky-deep"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onPlay?.(text);
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
      </svg>
    </button>
  );
}

export function ColourToken({
  colour,
  children,
  className,
}: {
  colour?: GrammarColour;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("rounded px-1", colour && `grammar-${colour}`, className)}>{children}</span>
  );
}

export function LetterTile({
  glyph,
  active,
  onSelect,
}: {
  glyph: string;
  active?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        "aspect-square rounded-card border text-xl font-bold transition-all",
        active ? "border-ink bg-ink text-paper" : "border-line bg-white hover:bg-paper-2",
      )}
    >
      {glyph}
    </button>
  );
}

export function NumberChip({
  value,
  word,
  onPlay,
}: {
  value: number;
  word: string;
  onPlay?: OnPlay;
}) {
  return (
    <button
      type="button"
      className="flex items-center justify-between rounded-chip px-3 py-1.5 text-left hover:bg-paper-2"
      onClick={() => onPlay?.(word)}
    >
      <span className="tabular-nums text-ink-3">{value}</span>
      <span className="font-semibold">{word}</span>
    </button>
  );
}

export function StressMark({ children, stressed }: { children: ReactNode; stressed?: boolean }) {
  return (
    <span
      className={cx(
        stressed &&
          "text-amber-deep underline decoration-amber-deep decoration-4 underline-offset-4",
      )}
    >
      {children}
    </span>
  );
}

/** Arrow between two agreeing tokens, rendered as a labelled connector line. */
export function AgreementArrow({
  from,
  to,
  colour = "rose",
}: {
  from: string;
  to: string;
  colour?: GrammarColour;
}) {
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs", COLOUR_TX[colour])}>
      <span>{from}</span>
      <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
        <path d="M1 5h22m0 0-4-4m4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span>{to}</span>
    </span>
  );
}

export function PatternSlot({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o, j) => (
          <button
            type="button"
            key={o}
            onClick={() => onSelect(j)}
            className={cx(
              "rounded-chip border px-3 py-1.5 text-sm font-medium transition-colors",
              selected === j
                ? "border-ink bg-ink text-paper"
                : "border-line bg-white/70 text-ink-2 hover:bg-paper-2",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Minimal markdown: **bold**, headings, paragraphs. */
export function Markdownish({ text }: { text: string }) {
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
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={key}>
            {parts.map((p, j) =>
              p.startsWith("**") ? (
                <strong key={`${key}-${j}`}>{p.slice(2, -2)}</strong>
              ) : (
                <span key={`${key}-${j}`}>{p}</span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}
