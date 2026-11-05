import type { Grade } from "@lm/schema";
import { t } from "@/lib/i18n";
import { cx } from "./ui";

const TONES: Record<Grade, string> = {
  1: "bg-sage-soft text-sage-deep border-sage",
  2: "bg-sky-soft text-sky-deep border-sky",
  3: "bg-amber-soft text-amber-deep border-amber",
  4: "bg-rose-soft text-rose-deep border-rose",
};

export function GradeChips({
  value,
  onPick,
  hints,
  size = "lg",
}: {
  value?: Grade;
  onPick: (g: Grade) => void;
  hints?: Record<Grade, string>;
  size?: "md" | "lg";
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {([4, 3, 2, 1] as Grade[]).map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onPick(g)}
          className={cx(
            "flex flex-col items-center rounded-card border-2 font-semibold transition-all active:scale-95",
            size === "lg" ? "py-3" : "py-2 text-sm",
            TONES[g],
            value === g ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : "opacity-90",
          )}
        >
          <span>{t(`grade.${g}` as "grade.1")}</span>
          {hints?.[g] && <span className="text-[11px] font-normal opacity-80">{hints[g]}</span>}
        </button>
      ))}
    </div>
  );
}
