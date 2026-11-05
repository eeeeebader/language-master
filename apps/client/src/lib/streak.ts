import { computeStreak, type DateRange, type StreakResult, toLocalDay } from "@lm/srs";
import { db } from "@/db/db";

/** Same computation as the useStreak hook, callable outside React. */
export async function computeStreakNow(): Promise<StreakResult & { vacations: DateRange[] }> {
  const settings = await db.settings.get("me");
  const activity = await db.activity.toArray();
  const log = await db.streakLog.toArray();
  const today = toLocalDay(new Date());
  const vacations = log
    .filter((l) => l.kind === "vacation" && l.from && l.to)
    .map((l) => ({ from: l.from as string, to: l.to as string }));
  if (settings?.vacationUntil && settings.vacationUntil >= today)
    vacations.push({ from: today, to: settings.vacationUntil });
  const reactivations = log
    .filter((l) => l.kind === "reactivation" && l.from && l.to)
    .map((l) => ({ from: l.from as string, to: l.to as string }));
  const r = computeStreak({
    activityDays: new Set(
      activity.filter((a) => a.reviews + a.lecturesDone + a.storiesRead > 0).map((a) => a.day),
    ),
    learningDays: settings?.learningDays ?? [1, 2, 3, 4, 5],
    vacations,
    reactivations,
    today,
  });
  return { ...r, vacations };
}
