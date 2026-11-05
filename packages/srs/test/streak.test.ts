import { describe, expect, it } from "vitest";
import { computeStreak, isoWeekKey, nextDeadline, reminderTime } from "../src";

// 2026-11-05 is a Thursday.
const MF = [1, 2, 3, 4, 5];
const set = (...d: string[]) => new Set(d);

describe("streak", () => {
  it("counts learned days and keeps alive on rest days", () => {
    const r = computeStreak({
      activityDays: set("2026-10-30", "2026-11-02", "2026-11-03"),
      learningDays: MF,
      vacations: [],
      reactivations: [],
      today: "2026-11-04",
    });
    // Fri 30, (Sat/Sun rest), Mon 2, Tue 3, Wed 4 is today and still open
    expect(r.broken).toBe(false);
    expect(r.count).toBe(3);
  });

  it("breaks only on a missed learning day", () => {
    const r = computeStreak({
      activityDays: set("2026-11-02", "2026-11-03"),
      learningDays: MF,
      vacations: [],
      reactivations: [],
      today: "2026-11-05",
    });
    expect(r.broken).toBe(true);
    expect(r.missedLearningDays).toBe(1);
    expect(r.canReactivate).toBe(true);
    expect(r.restorableCount).toBe(2);
    expect(r.gap).toEqual({ from: "2026-11-04", to: "2026-11-04" });
  });

  it("does not break on a rest day or during vacation", () => {
    const r = computeStreak({
      activityDays: set("2026-11-03"),
      learningDays: [2, 4],
      vacations: [{ from: "2026-11-05", to: "2026-11-06" }],
      reactivations: [],
      today: "2026-11-09",
    });
    expect(r.broken).toBe(false);
    expect(r.count).toBe(1);
  });

  it("reactivation forgives the gap", () => {
    const r = computeStreak({
      activityDays: set("2026-11-02", "2026-11-03", "2026-11-05"),
      learningDays: MF,
      vacations: [],
      reactivations: [{ from: "2026-11-04", to: "2026-11-04" }],
      today: "2026-11-05",
    });
    expect(r.broken).toBe(false);
    expect(r.count).toBe(3);
  });

  it("cannot reactivate after more than five missed learning days", () => {
    const r = computeStreak({
      activityDays: set("2026-10-20"),
      learningDays: MF,
      vacations: [],
      reactivations: [],
      today: "2026-11-05",
    });
    expect(r.broken).toBe(true);
    expect(r.canReactivate).toBe(false);
  });

  it("learning on a rest day adds a day", () => {
    const r = computeStreak({
      activityDays: set("2026-10-30", "2026-10-31", "2026-11-02"),
      learningDays: MF,
      vacations: [],
      reactivations: [],
      today: "2026-11-02",
    });
    expect(r.count).toBe(3);
  });
});

describe("deadline", () => {
  it("is 23:59 on the next learning day after the last learned day", () => {
    const d = nextDeadline("2026-11-03", MF, []);
    expect(d?.getDate()).toBe(4);
    expect(d?.getHours()).toBe(23);
    expect(d?.getMinutes()).toBe(59);
    expect(reminderTime(d as Date).getHours()).toBe(22);
  });

  it("skips rest days and vacation", () => {
    const d = nextDeadline("2026-11-03", [2, 4], [{ from: "2026-11-05", to: "2026-11-05" }]);
    expect(d?.getDate()).toBe(10);
    expect(nextDeadline("2026-11-03", [], [])).toBeNull();
  });

  it("iso week keys", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2026-11-05")).toBe("2026-W45");
  });
});
