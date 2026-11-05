/** yyyy-mm-dd in the device's local time zone. */
export function toLocalDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(day: string, n: number): string {
  const d = parseLocalDay(day);
  d.setDate(d.getDate() + n);
  return toLocalDay(d);
}

export function weekdayOf(day: string): number {
  return parseLocalDay(day).getDay();
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDay(b).getTime() - parseLocalDay(a).getTime()) / 86_400_000);
}

/** End of a local day (23:59:59.999). */
export function endOfLocalDay(day: string): Date {
  const d = parseLocalDay(day);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Monday-based ISO week key, e.g. 2026-W45, used for the velocity chart. */
export function isoWeekKey(day: string): string {
  const d = parseLocalDay(day);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604_800_000);
  return `${new Date(firstThursday).getFullYear()}-W${String(week).padStart(2, "0")}`;
}
