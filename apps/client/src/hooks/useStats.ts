import { computeStreak, isDue, isMastered, isoWeekKey, masteryTimeline, toLocalDay } from "@lm/srs";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { storyLemmas } from "@/lib/coverage";

export function useDueCount() {
  return useLiveQuery(async () => {
    const now = new Date();
    const states = await db.cardStates.toArray();
    return states.filter((s) => isDue(s, now)).length;
  }, []);
}

export function useMasteredCount() {
  return useLiveQuery(async () => {
    const states = await db.cardStates.toArray();
    const words = new Set(states.filter(isMastered).map((s) => s.wordId));
    return words.size;
  }, []);
}

export function useWordsReadInStories() {
  return useLiveQuery(async () => {
    const progress = await db.storyProgress.toArray();
    const finished = progress.filter((p) => p.finishedAt);
    let total = 0;
    for (const p of finished) {
      const story = await db.stories.get(p.storyId);
      if (story) for (const n of storyLemmas(story).values()) total += n;
    }
    return total;
  }, []);
}

export function useDailyAverageMinutes() {
  return useLiveQuery(async () => {
    const days = await db.activity.toArray();
    const last14 = days.filter((d) => d.day >= toLocalDay(new Date(Date.now() - 13 * 86_400_000)));
    if (last14.length === 0) return 0;
    const minutes = last14.reduce((a, d) => a + d.minutes + d.reviews * 0.12, 0);
    return Math.round((minutes / 14) * 10) / 10;
  }, []);
}

/** New words mastered per ISO week for the last 12 weeks. */
export function useWeeklyVelocity() {
  return useLiveQuery(async () => {
    const events = await db.events.toArray();
    const tl = masteryTimeline(events);
    const weeks: { key: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--)
      weeks.push({
        key: isoWeekKey(toLocalDay(new Date(Date.now() - i * 7 * 86_400_000))),
        count: 0,
      });
    const idx = new Map(weeks.map((w, i) => [w.key, i]));
    for (const day of tl.values()) {
      const i = idx.get(isoWeekKey(day));
      if (i !== undefined) (weeks[i] as { count: number }).count++;
    }
    return weeks;
  }, []);
}

export function useActivityDays() {
  return useLiveQuery(() => db.activity.toArray(), []);
}

export function useStreak() {
  return useLiveQuery(async () => {
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
    return computeStreak({
      activityDays: new Set(
        activity.filter((a) => a.reviews + a.lecturesDone + a.storiesRead > 0).map((a) => a.day),
      ),
      learningDays: settings?.learningDays ?? [1, 2, 3, 4, 5],
      vacations,
      reactivations,
      today,
    });
  }, []);
}
