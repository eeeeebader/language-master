import { addDays, daysBetween, endOfLocalDay, weekdayOf } from "./dates";

export interface DateRange {
  from: string;
  to: string;
}

export interface StreakInput {
  /** Local days (yyyy-mm-dd) with at least one learning event. */
  activityDays: ReadonlySet<string>;
  /** Weekdays (0 = Sunday) the learner committed to. */
  learningDays: readonly number[];
  vacations: readonly DateRange[];
  /** Gaps the learner forgave with the restore button. */
  reactivations: readonly DateRange[];
  today: string;
  /** Max missed learning days that can still be restored. */
  maxRestorable?: number;
}

export interface StreakResult {
  /** Current live streak (0 when broken). */
  count: number;
  broken: boolean;
  /** Learning days missed since the last learned day. */
  missedLearningDays: number;
  /** Count the streak would show after reactivation. */
  restorableCount: number;
  canReactivate: boolean;
  lastLearnedDay: string | null;
  /** Range a reactivation would forgive. */
  gap: DateRange | null;
}

const inRange = (day: string, r: DateRange) => day >= r.from && day <= r.to;

function isLearningDay(day: string, input: StreakInput): boolean {
  return input.learningDays.includes(weekdayOf(day));
}

function isVacation(day: string, input: StreakInput): boolean {
  return input.vacations.some((v) => inRange(day, v));
}

function isForgiven(day: string, input: StreakInput): boolean {
  return input.reactivations.some((v) => inRange(day, v));
}

/** Count learned days walking back from `start` until a non-forgiven missed learning day. */
function countRun(start: string, input: StreakInput, floor: string): number {
  let count = 0;
  for (let d = start; d >= floor; d = addDays(d, -1)) {
    if (input.activityDays.has(d)) {
      count++;
      continue;
    }
    if (d === input.today) continue;
    if (isVacation(d, input) || !isLearningDay(d, input) || isForgiven(d, input)) continue;
    break;
  }
  return count;
}

export function computeStreak(input: StreakInput): StreakResult {
  const maxRestorable = input.maxRestorable ?? 5;
  const sorted = [...input.activityDays].sort();
  const lastLearnedDay = sorted.length ? (sorted[sorted.length - 1] as string) : null;
  const floor = sorted[0] ?? input.today;

  if (!lastLearnedDay) {
    return {
      count: 0,
      broken: false,
      missedLearningDays: 0,
      restorableCount: 0,
      canReactivate: false,
      lastLearnedDay: null,
      gap: null,
    };
  }

  // Missed learning days strictly between last learned day and today.
  let missed = 0;
  for (let d = addDays(lastLearnedDay, 1); d < input.today; d = addDays(d, 1)) {
    if (isLearningDay(d, input) && !isVacation(d, input) && !isForgiven(d, input)) missed++;
  }

  const live = countRun(input.today, input, floor);
  if (missed === 0) {
    return {
      count: live,
      broken: false,
      missedLearningDays: 0,
      restorableCount: live,
      canReactivate: false,
      lastLearnedDay,
      gap: null,
    };
  }

  const gap = { from: addDays(lastLearnedDay, 1), to: addDays(input.today, -1) };
  const forgiving: StreakInput = { ...input, reactivations: [...input.reactivations, gap] };
  const restorable = countRun(input.today, forgiving, floor);
  return {
    count: 0,
    broken: true,
    missedLearningDays: missed,
    restorableCount: restorable,
    canReactivate: missed <= maxRestorable && daysBetween(lastLearnedDay, input.today) <= 60,
    lastLearnedDay,
    gap,
  };
}

/**
 * Streak deadline: 23:59 local on the next learning day strictly after the last learned day,
 * skipping vacation days. Returns null when no learning days are set.
 */
export function nextDeadline(
  lastLearnedDay: string,
  learningDays: readonly number[],
  vacations: readonly DateRange[],
): Date | null {
  if (learningDays.length === 0) return null;
  for (let i = 1; i <= 60; i++) {
    const d = addDays(lastLearnedDay, i);
    if (learningDays.includes(weekdayOf(d)) && !vacations.some((v) => inRange(d, v)))
      return endOfLocalDay(d);
  }
  return null;
}

/** Reminder time: one hour before the deadline. */
export function reminderTime(deadline: Date): Date {
  return new Date(deadline.getTime() - 3_600_000);
}
