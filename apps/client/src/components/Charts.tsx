import { addDays, daysBetween, toLocalDay, weekdayOf } from "@lm/srs";
import { cx } from "./ui";

/**
 * Activity calendar: 14 past weeks and 2 future weeks, Monday-first rows. Days before the account
 * existed stay blank; past learning days without learning are tinted; future learning days are
 * outlined so the learner sees their rhythm ahead; vacation days are amber.
 */
export function ActivityCalendar({
  days,
  learningDays,
  since,
  vacationUntil,
  pastWeeks = 14,
  futureWeeks = 2,
}: {
  days: { day: string; count: number }[];
  learningDays: number[];
  /** yyyy-mm-dd the account was created; earlier days are not shown as missed */
  since?: string;
  vacationUntil?: string | null;
  pastWeeks?: number;
  futureWeeks?: number;
}) {
  const map = new Map(days.map((d) => [d.day, d.count]));
  const today = toLocalDay(new Date());
  const todayWd = (weekdayOf(today) + 6) % 7; // Monday = 0
  // Young accounts: start at the account's week (at least 4 weeks back) so the grid fills the width.
  let back = pastWeeks;
  if (since) {
    const sinceWeeks = Math.ceil(Math.max(0, daysBetween(since, today)) / 7);
    back = Math.max(4, Math.min(pastWeeks, sinceWeeks + 1));
  }
  const start = addDays(today, -(back * 7 + todayWd));
  const end = addDays(start, (back + futureWeeks + 1) * 7 - 1);
  const cells: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d);
  const weeks = Math.ceil(cells.length / 7);
  const level = (c: number) => (c < 10 ? "bg-sage/60" : c < 30 ? "bg-sage" : "bg-sage-deep");

  function cellClass(day: string): string {
    if (since && day < since) return "bg-transparent";
    const count = map.get(day) ?? 0;
    const isLearning = learningDays.includes(weekdayOf(day));
    const vacation = !!vacationUntil && day >= today && day <= vacationUntil;
    const isToday = day === today;
    const base = "rounded-[3px] ";
    if (count > 0)
      return `${base}${level(count)}${isToday ? " shadow-[inset_0_0_0_2px_var(--color-ink)]" : ""}`;
    if (isToday) return `${base}bg-white shadow-[inset_0_0_0_2px_var(--color-ink)]`;
    if (vacation) return `${base}bg-amber-soft`;
    if (day > today)
      return isLearning
        ? `${base}border border-dashed border-sage-deep/60 bg-white`
        : `${base}bg-paper-2/60`;
    return isLearning ? `${base}bg-rose-soft` : `${base}bg-paper-2`;
  }

  return (
    <div>
      <div className="flex gap-1">
        <div className="grid grid-rows-7 gap-1 pr-1 text-[9px] leading-none text-ink-3">
          {["Mo", "", "Mi", "", "Fr", "", "So"].map((l, i) => (
            <div key={`${l}-${i}`} className="flex items-center">
              {l}
            </div>
          ))}
        </div>
        <div
          className="grid flex-1 grid-flow-col grid-rows-7 gap-1 overflow-x-auto no-scrollbar"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {cells.map((day) => (
            <div
              key={day}
              title={`${day}${map.get(day) ? `: ${map.get(day)} Aktivitäten` : ""}`}
              className={`aspect-square w-full ${cellClass(day)}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <Legend className="bg-sage" label="gelernt" />
        <Legend className="bg-rose-soft" label="Lerntag verpasst" />
        <Legend className="border border-dashed border-sage-deep/60 bg-white" label="Lerntag" />
        <Legend className="bg-paper-2" label="Ruhetag" />
        <Legend className="bg-amber-soft" label="Urlaub" />
        <Legend className="bg-white shadow-[inset_0_0_0_2px_var(--color-ink)]" label="heute" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${className}`} />
      {label}
    </span>
  );
}

export function VelocityChart({ weeks }: { weeks: { key: string; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <div className="flex h-24 items-end gap-1.5">
      {weeks.map((w) => (
        <div
          key={w.key}
          className="flex flex-1 flex-col items-center gap-1"
          title={`${w.key}: ${w.count}`}
        >
          <div
            className="w-full rounded-t-md bg-lavender transition-all duration-500"
            style={{ height: `${Math.max(4, (w.count / max) * 80)}px` }}
          />
          <span className="text-[9px] text-ink-3">{w.key.slice(-2)}</span>
        </div>
      ))}
    </div>
  );
}
