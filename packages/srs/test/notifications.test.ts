import type { CardState } from "@lm/schema";
import { describe, expect, it } from "vitest";
import {
  applyQuietHours,
  DEFAULT_NOTIFICATION_PREFS,
  inQuietHours,
  type PlanInput,
  planNotifications,
  projectDue,
} from "../src";

// Wednesday 2026-11-04 14:25 local
const NOW = new Date(2026, 10, 4, 14, 25);
const base: PlanInput = {
  now: NOW,
  prefs: DEFAULT_NOTIFICATION_PREFS,
  learningDays: [1, 2, 3, 4, 5],
  vacations: [],
  lastLearnedDay: "2026-11-03",
  streakCount: 12,
  learnedDays: new Set(["2026-11-02", "2026-11-03"]),
  dueByDay: [3, 25, 30, 2, 0, 0, 0],
  freeStoryUsedToday: false,
  lastLectureDoneAt: null,
  nextLectureTitle: "Zahlen 0–20",
  weekly: {
    minutes: 42,
    reviews: 120,
    newMastered: 9,
    wordsRead: 300,
    streak: 12,
    strongestList: "Erste Wörter",
    weakestList: "Küche",
  },
};

describe("streak reminder", () => {
  it("fires one hour before 23:59 on the next learning day", () => {
    const plan = planNotifications(base);
    const streak = plan.find((p) => p.kind === "streak");
    expect(streak?.at.getDate()).toBe(4);
    expect(streak?.at.getHours()).toBe(22);
    expect(streak?.at.getMinutes()).toBe(59);
    expect(streak?.title).toContain("12-Tage");
  });

  it("is dropped once today has been learned and during vacation", () => {
    expect(
      planNotifications({ ...base, learnedDays: new Set(["2026-11-04"]) }).find(
        (p) => p.kind === "streak",
      ),
    ).toBeUndefined();
    expect(
      planNotifications({ ...base, vacations: [{ from: "2026-11-04", to: "2026-11-10" }] }).find(
        (p) => p.kind === "streak",
      ),
    ).toBeUndefined();
  });

  it("moves into the minute before quiet hours", () => {
    const plan = planNotifications({
      ...base,
      prefs: { ...base.prefs, quietHours: { start: "22:00", end: "07:00" } },
    });
    const streak = plan.find((p) => p.kind === "streak");
    expect(streak?.at.getHours()).toBe(21);
    expect(streak?.at.getMinutes()).toBe(59);
  });
});

describe("study, due, story, weekly, nudge", () => {
  it("study reminders name something concrete and skip practised days", () => {
    const prefs = {
      ...base.prefs,
      studyReminders: [{ id: "r1", weekdays: [3, 4], time: "07:30" }],
    };
    const plan = planNotifications({ ...base, prefs, learnedDays: new Set(["2026-11-05"]) });
    const study = plan.filter((p) => p.kind === "study");
    // today 07:30 is past; Thursday is learned → none this week before the horizon ends (next Wed 11-11)
    expect(study.map((s) => s.at.getDate())).toEqual([]);
    const plan2 = planNotifications({ ...base, prefs, now: new Date(2026, 10, 4, 6, 0) });
    const s2 = plan2.filter((p) => p.kind === "study");
    expect(s2[0]?.at.getDate()).toBe(4);
    expect(s2[0]?.body).toContain("3 Karten");
  });

  it("cards-due only at or above the threshold, free story only while unused", () => {
    const prefs = {
      ...base.prefs,
      cardsDue: { enabled: true, time: "09:00", threshold: 20 },
      freeStory: { enabled: true, time: "12:00" },
    };
    const plan = planNotifications({ ...base, prefs, freeStoryUsedToday: true });
    expect(plan.filter((p) => p.kind === "cards_due").map((p) => p.at.getDate())).toEqual([5, 6]);
    const stories = plan.filter((p) => p.kind === "free_story").map((p) => p.at.getDate());
    expect(stories[0]).toBe(5); // today's used, tomorrow's scheduled
  });

  it("weekly summary carries the computed numbers and ignores quiet hours", () => {
    const plan = planNotifications({
      ...base,
      prefs: { ...base.prefs, quietHours: { start: "17:00", end: "20:00" } },
    });
    const weekly = plan.find((p) => p.kind === "weekly");
    expect(weekly?.at.getDay()).toBe(0);
    expect(weekly?.at.getHours()).toBe(18);
    expect(weekly?.body).toContain("9 neue Wörter");
    expect(weekly?.body).toContain("Küche");
  });

  it("lecture nudge three days after the last node", () => {
    const plan = planNotifications({
      ...base,
      prefs: { ...base.prefs, lectureNudge: { enabled: true } },
      lastLectureDoneAt: new Date(2026, 10, 3, 10, 0),
    });
    const nudge = plan.find((p) => p.kind === "lecture_nudge");
    expect(nudge?.at.getDate()).toBe(6);
    expect(nudge?.body).toContain("Zahlen");
  });

  it("ids are stable per kind and day", () => {
    const a = planNotifications(base).map((p) => p.id);
    const b = planNotifications({ ...base, now: new Date(2026, 10, 4, 14, 30) }).map((p) => p.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("helpers", () => {
  it("quiet hours wrap midnight", () => {
    const q = { start: "22:00", end: "07:00" };
    expect(inQuietHours(new Date(2026, 10, 4, 23, 0), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 10, 4, 6, 0), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 10, 4, 12, 0), q)).toBe(false);
    const moved = applyQuietHours(new Date(2026, 10, 5, 6, 0), q);
    expect(moved.getDate()).toBe(4);
    expect(moved.getHours()).toBe(21);
  });

  it("projects due counts per day", () => {
    const st = (due: Date): CardState => ({
      variantId: due.toISOString(),
      wordId: "w",
      stability: 1,
      difficulty: 5,
      due: due.toISOString(),
      lastReview: null,
      reps: 1,
      lapses: 0,
      state: 2,
      elapsedDays: 0,
      scheduledDays: 1,
    });
    const states = [
      st(new Date(2026, 10, 4, 9)),
      st(new Date(2026, 10, 5, 9)),
      st(new Date(2026, 10, 9, 9)),
    ];
    expect(projectDue(states, NOW, 3)).toEqual([1, 2, 2]);
  });
});
