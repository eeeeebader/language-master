import { addDays, toLocalDay } from "@lm/srs";
import { cx } from "./ui";

/** GitHub-style activity calendar of the last 16 weeks. */
export function ActivityCalendar({
  days,
  learningDays,
}: {
  days: { day: string; count: number }[];
  learningDays: number[];
}) {
  const map = new Map(days.map((d) => [d.day, d.count]));
  const today = toLocalDay(new Date());
  const weeks = 16;
  // Align the grid so columns are weeks ending today.
  const end = today;
  const start = addDays(end, -(weeks * 7 - 1));
  const cells: { day: string; count: number; future: boolean; learning: boolean }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = new Date(`${d}T12:00:00`).getDay();
    cells.push({
      day: d,
      count: map.get(d) ?? 0,
      future: false,
      learning: learningDays.includes(wd),
    });
  }
  const level = (c: number) =>
    c === 0 ? "bg-paper-2" : c < 10 ? "bg-sage/50" : c < 30 ? "bg-sage" : "bg-sage-deep";
  return (
    <div
      className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto no-scrollbar"
      style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
    >
      {cells.map((c) => (
        <div
          key={c.day}
          title={`${c.day}: ${c.count}`}
          className={cx(
            "aspect-square w-full rounded-[3px]",
            level(c.count),
            c.count === 0 && !c.learning && "opacity-40",
            c.day === today && "ring-1 ring-ink",
          )}
        />
      ))}
    </div>
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
