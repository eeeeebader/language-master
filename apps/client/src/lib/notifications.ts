/**
 * Local notifications: everything is computed on the device from Dexie and scheduled through
 * Capacitor on iOS/Android. On the web nothing is scheduled; the settings page shows the plan.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { NotificationPrefs } from "@lm/schema";
import {
  DEFAULT_NOTIFICATION_PREFS,
  isoWeekKey,
  masteryTimeline,
  type PlannedNotification,
  planNotifications,
  projectDue,
  toLocalDay,
  type WeeklySummaryData,
} from "@lm/srs";
import { LECTURES_ES } from "@/data/lectures-es";
import { db } from "@/db/db";
import { fetchBilling } from "./billing";
import { computeStreakNow } from "./streak";

export const isNative = Capacitor.isNativePlatform();
const IDS_KEY = "lm.notifications.ids";

export function prefsOf(n: NotificationPrefs | undefined): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, permissionAsked: false, ...(n ?? {}) };
}

/** Last 7 days, computed from the review log and activity rows. */
export async function weeklySummary(): Promise<WeeklySummaryData> {
  const since = toLocalDay(new Date(Date.now() - 6 * 86_400_000));
  const [activity, events, lists, listWords, states] = await Promise.all([
    db.activity.where("day").aboveOrEqual(since).toArray(),
    db.events.toArray(),
    db.lists.filter((l) => !l.deletedAt).toArray(),
    db.listWords.toArray(),
    db.cardStates.toArray(),
  ]);
  const minutes = activity.reduce((a, d) => a + d.minutes + d.reviews * 0.12, 0);
  const reviews = activity.reduce((a, d) => a + d.reviews, 0);
  const thisWeek = isoWeekKey(toLocalDay(new Date()));
  let newMastered = 0;
  for (const day of masteryTimeline(events).values())
    if (isoWeekKey(day) === thisWeek) newMastered++;
  const wordsRead = activity.reduce((a, d) => a + d.storiesRead, 0) * 300;
  // list strength: mean stability of the list's words
  const byWord = new Map<string, number>();
  for (const s of states) byWord.set(s.wordId, Math.max(byWord.get(s.wordId) ?? 0, s.stability));
  const scored = lists
    .map((l) => {
      const words = listWords.filter((lw) => lw.listId === l.id);
      const vals = words.map((w) => byWord.get(w.wordId) ?? 0);
      return {
        title: l.title,
        score: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : -1,
      };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);
  const streak = await computeStreakNow();
  return {
    minutes,
    reviews,
    newMastered,
    wordsRead,
    streak: streak.count,
    strongestList: scored[0]?.title ?? null,
    weakestList: scored.length > 1 ? (scored[scored.length - 1]?.title ?? null) : null,
  };
}

/** Build the current plan from local data. Used by the scheduler and the settings preview. */
export async function buildPlan(now = new Date()): Promise<PlannedNotification[]> {
  const settings = await db.settings.get("me");
  if (!settings) return [];
  const prefs = prefsOf(settings.notifications);
  const [states, activity, doneLectures, streak, billing, weekly] = await Promise.all([
    db.cardStates.toArray(),
    db.activity.toArray(),
    db.lectureProgress.toArray(),
    computeStreakNow(),
    fetchBilling(),
    weeklySummary(),
  ]);
  const learnedDays = new Set(
    activity
      .filter((a) => a.reviews + a.lecturesDone + a.storiesRead > 0 || a.minutes >= 3)
      .map((a) => a.day),
  );
  const lastLecture = doneLectures.sort((a, b) => b.doneAt.localeCompare(a.doneAt))[0];
  const next = LECTURES_ES.find((l) => !doneLectures.some((d) => d.lectureId === l.id));
  const vacations = streak.vacations;
  return planNotifications({
    now,
    prefs,
    learningDays: settings.learningDays,
    vacations,
    lastLearnedDay: streak.lastLearnedDay,
    streakCount: streak.count,
    learnedDays,
    dueByDay: projectDue(states, now),
    freeStoryUsedToday: billing.free_left === 0,
    lastLectureDoneAt: lastLecture ? new Date(lastLecture.doneAt) : null,
    nextLectureTitle: next?.title.de ?? null,
    weekly,
  });
}

/** Cancel the previous plan and schedule the fresh one (native only). */
export async function rescheduleNotifications(): Promise<PlannedNotification[]> {
  const plan = await buildPlan();
  if (!isNative) return plan;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return plan;
    const prev = JSON.parse(localStorage.getItem(IDS_KEY) ?? "[]") as number[];
    if (prev.length) await LocalNotifications.cancel({ notifications: prev.map((id) => ({ id })) });
    if (plan.length)
      await LocalNotifications.schedule({
        notifications: plan.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          schedule: { at: p.at, allowWhileIdle: true },
          extra: { kind: p.kind },
        })),
      });
    localStorage.setItem(IDS_KEY, JSON.stringify(plan.map((p) => p.id)));
  } catch {
    /* scheduling is best effort */
  }
  return plan;
}

/** Ask for the OS permission once, after the first completed session, never during onboarding. */
export async function maybeAskPermission(): Promise<void> {
  const settings = await db.settings.get("me");
  if (!settings) return;
  const prefs = prefsOf(settings.notifications);
  if (prefs.permissionAsked) return;
  await db.settings.update("me", { notifications: { ...prefs, permissionAsked: true } });
  if (!isNative) return;
  try {
    await LocalNotifications.requestPermissions();
  } catch {
    /* ignore */
  }
  await rescheduleNotifications();
}
