import type { CardState } from "@lm/schema";
import { addDays, parseLocalDay, toLocalDay, weekdayOf } from "./dates";
import { type DateRange, nextDeadline, reminderTime } from "./streak";

export interface StudyReminder {
  id: string;
  weekdays: number[];
  /** HH:MM local */
  time: string;
}

export interface NotificationPrefs {
  streak: boolean;
  quietHours: { start: string; end: string } | null;
  studyReminders: StudyReminder[];
  weekly: { enabled: boolean; weekday: number; time: string };
  cardsDue: { enabled: boolean; time: string; threshold: number };
  freeStory: { enabled: boolean; time: string };
  lectureNudge: { enabled: boolean };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  streak: true,
  quietHours: null,
  studyReminders: [],
  weekly: { enabled: true, weekday: 0, time: "18:00" },
  cardsDue: { enabled: false, time: "09:00", threshold: 20 },
  freeStory: { enabled: false, time: "12:00" },
  lectureNudge: { enabled: false },
};

export type NotificationKind =
  | "streak"
  | "study"
  | "weekly"
  | "cards_due"
  | "free_story"
  | "lecture_nudge";

export interface PlannedNotification {
  /** Stable numeric id for the platform scheduler (kind bucket + day ordinal). */
  id: number;
  kind: NotificationKind;
  at: Date;
  title: string;
  body: string;
}

export interface WeeklySummaryData {
  minutes: number;
  reviews: number;
  newMastered: number;
  wordsRead: number;
  streak: number;
  strongestList: string | null;
  weakestList: string | null;
}

export interface PlanInput {
  now: Date;
  prefs: NotificationPrefs;
  learningDays: readonly number[];
  vacations: readonly DateRange[];
  lastLearnedDay: string | null;
  streakCount: number;
  /** Local days already learned on (for "skip if practised"). */
  learnedDays: ReadonlySet<string>;
  /** Due-card count projected for each of the next days, index 0 = today. */
  dueByDay: readonly number[];
  freeStoryUsedToday: boolean;
  lastLectureDoneAt: Date | null;
  nextLectureTitle: string | null;
  weekly: WeeklySummaryData;
  /** How far ahead to plan (days). Platforms cap pending notifications; 7 is plenty. */
  horizonDays?: number;
}

const KIND_BASE: Record<NotificationKind, number> = {
  streak: 1000,
  study: 2000,
  weekly: 3000,
  cards_due: 4000,
  free_story: 5000,
  lecture_nudge: 6000,
};

export function atLocal(day: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const d = parseLocalDay(day);
  d.setHours(h, m, 0, 0);
  return d;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** Inside quiet hours (which may wrap midnight)? */
export function inQuietHours(at: Date, q: NotificationPrefs["quietHours"]): boolean {
  if (!q) return false;
  const t = at.getHours() * 60 + at.getMinutes();
  const s = minutes(q.start);
  const e = minutes(q.end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

/** A time inside quiet hours moves to the last minute before they begin. */
export function applyQuietHours(at: Date, q: NotificationPrefs["quietHours"]): Date {
  if (!inQuietHours(at, q) || !q) return at;
  const moved = new Date(at);
  const s = minutes(q.start);
  moved.setHours(Math.floor(s / 60), s % 60, 0, 0);
  moved.setMinutes(moved.getMinutes() - 1);
  // quiet hours wrapping midnight: a morning time belongs to the block that started yesterday
  if (moved.getTime() > at.getTime()) moved.setDate(moved.getDate() - 1);
  return moved;
}

function dayOrdinal(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000) % 1000;
}

const inVacation = (day: string, v: readonly DateRange[]) =>
  v.some((r) => day >= r.from && day <= r.to);

/** Count due cards at the end of each of the next `days` local days (index 0 = today). */
export function projectDue(states: readonly CardState[], now: Date, days = 7): number[] {
  const today = toLocalDay(now);
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    const end = parseLocalDay(addDays(today, i));
    end.setHours(23, 59, 59, 999);
    out.push(states.filter((s) => new Date(s.due).getTime() <= end.getTime()).length);
  }
  return out;
}

function concreteHint(i: PlanInput, dayIndex: number): string {
  const due = i.dueByDay[dayIndex] ?? 0;
  if (due > 0) return `${due} Karten warten auf dich.`;
  if (i.nextLectureTitle) return `Nächste Lektion: ${i.nextLectureTitle}.`;
  if (!i.freeStoryUsedToday || dayIndex > 0) return "Deine freie Geschichte für heute wartet.";
  return "Eine kurze Sitzung reicht.";
}

/**
 * Pure planner: everything the device should have scheduled right now. Call it on app open,
 * after every learning event and after a settings change; cancel the previous plan and
 * schedule this one.
 */
export function planNotifications(i: PlanInput): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const horizon = i.horizonDays ?? 7;
  const today = toLocalDay(i.now);
  const q = i.prefs.quietHours;
  const push = (kind: NotificationKind, at: Date, title: string, body: string) => {
    const t = kind === "weekly" ? at : applyQuietHours(at, q);
    if (t.getTime() <= i.now.getTime()) return;
    out.push({ id: KIND_BASE[kind] + dayOrdinal(t), kind, at: t, title, body });
  };

  // Streak: 1 h before the deadline on the next learning day after the last learned day.
  if (i.prefs.streak && i.streakCount >= 1 && i.lastLearnedDay && !inVacation(today, i.vacations)) {
    const deadline = nextDeadline(i.lastLearnedDay, i.learningDays, i.vacations);
    if (deadline && !i.learnedDays.has(toLocalDay(deadline))) {
      push(
        "streak",
        reminderTime(deadline),
        `Deine ${i.streakCount}-Tage-Serie endet in 1 Stunde`,
        "Eine kurze Sitzung hält sie am Leben.",
      );
    }
  }

  for (let d = 0; d < horizon; d++) {
    const day = addDays(today, d);
    const wd = weekdayOf(day);
    const vacation = inVacation(day, i.vacations);
    const learned = i.learnedDays.has(day);

    // Study reminders: skipped on days already practised and during vacation.
    if (!vacation && !learned) {
      for (const r of i.prefs.studyReminders) {
        if (!r.weekdays.includes(wd)) continue;
        push("study", atLocal(day, r.time), "Zeit zum Lernen", concreteHint(i, d));
      }
    }

    // Cards due: when the projected count reaches the threshold.
    if (i.prefs.cardsDue.enabled && !vacation) {
      const due = i.dueByDay[d] ?? 0;
      if (due >= i.prefs.cardsDue.threshold)
        push(
          "cards_due",
          atLocal(day, i.prefs.cardsDue.time),
          `${due} Karten fällig`,
          "Jetzt wiederholen, bevor es mehr werden.",
        );
    }

    // Free story: every day it is still unused at the chosen time.
    if (i.prefs.freeStory.enabled && !vacation && !(d === 0 && i.freeStoryUsedToday)) {
      push(
        "free_story",
        atLocal(day, i.prefs.freeStory.time),
        "Deine freie Geschichte wartet",
        "Eine neue Geschichte aus deinen Wörtern – heute kostenlos.",
      );
    }

    // Weekly summary on the chosen weekday; text is recomputed on every reschedule.
    if (i.prefs.weekly.enabled && wd === i.prefs.weekly.weekday) {
      const w = i.weekly;
      const lists =
        w.strongestList && w.weakestList
          ? ` Stärkste Liste: ${w.strongestList}, schwächste: ${w.weakestList}.`
          : "";
      push(
        "weekly",
        atLocal(day, i.prefs.weekly.time),
        "Deine Woche",
        `${Math.round(w.minutes)} Minuten, ${w.reviews} Wiederholungen, ${w.newMastered} neue Wörter gemeistert, ${w.wordsRead} Wörter in Geschichten, Serie ${w.streak}.${lists}`,
      );
    }
  }

  // Lecture nudge: 3 days after the last finished node, once.
  if (i.prefs.lectureNudge.enabled && i.lastLectureDoneAt && i.nextLectureTitle) {
    const at = new Date(i.lastLectureDoneAt.getTime() + 3 * 86_400_000);
    at.setHours(18, 0, 0, 0);
    push("lecture_nudge", at, "Weiter auf dem Lernpfad", `Als Nächstes: ${i.nextLectureTitle}.`);
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
