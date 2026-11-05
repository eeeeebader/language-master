import type { ReviewEvent } from "@lm/schema";
import { describe, expect, it } from "vitest";
import {
  applyReview,
  emptyState,
  isDue,
  isMastered,
  masteryTimeline,
  previewReview,
  replay,
  retrievability,
  toFsrsRating,
} from "../src";

const T0 = new Date("2026-01-01T10:00:00.000Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

function ev(
  i: number,
  variantId: string,
  grade: 1 | 2 | 3 | 4,
  at: Date,
  extra: Partial<ReviewEvent> = {},
): ReviewEvent {
  return {
    id: String(i).padStart(26, "0"),
    variantId,
    wordId: `w-${variantId}`,
    grade,
    reactionMs: 1000,
    mode: "classic",
    promptKind: null,
    reviewedAt: at.toISOString(),
    supersedes: null,
    manual: true,
    synced: false,
    ...extra,
  };
}

describe("fsrs wrapper", () => {
  it("maps our 1..4 scale onto FSRS Easy..Again", () => {
    expect(toFsrsRating(1)).toBe(4);
    expect(toFsrsRating(4)).toBe(1);
  });

  it("new cards are due immediately", () => {
    expect(isDue(emptyState("v", "w", T0), T0)).toBe(true);
    expect(isDue(undefined, T0)).toBe(true);
  });

  it("Easy schedules further out than Again", () => {
    const p = previewReview(null, T0);
    expect(p[1].getTime()).toBeGreaterThan(p[2].getTime());
    expect(p[2].getTime()).toBeGreaterThan(p[3].getTime());
    expect(p[3].getTime()).toBeGreaterThanOrEqual(p[4].getTime());
  });

  it("stability grows with consecutive Good reviews", () => {
    let s = applyReview(null, "v", "w", 2, T0);
    const s1 = s.stability;
    s = applyReview(s, "v", "w", 2, days(1));
    s = applyReview(s, "v", "w", 2, days(4));
    s = applyReview(s, "v", "w", 2, days(12));
    expect(s.stability).toBeGreaterThan(s1);
    expect(s.reps).toBe(4);
  });

  it("Again after review state increments lapses", () => {
    let s = applyReview(null, "v", "w", 1, T0);
    s = applyReview(s, "v", "w", 1, days(5));
    s = applyReview(s, "v", "w", 4, days(40));
    expect(s.lapses).toBe(1);
  });

  it("retrievability decays over time", () => {
    const s = applyReview(null, "v", "w", 2, T0);
    expect(retrievability(s, days(0))).toBeCloseTo(1, 2);
    expect(retrievability(s, days(30))).toBeLessThan(retrievability(s, days(3)));
  });
});

describe("replay", () => {
  it("is deterministic regardless of input order", () => {
    const events = [
      ev(1, "a", 2, days(0)),
      ev(2, "a", 2, days(2)),
      ev(3, "b", 4, days(1)),
      ev(4, "a", 1, days(7)),
    ];
    const a = replay(events);
    const b = replay(events.slice().reverse());
    expect(a.get("a")).toEqual(b.get("a"));
    expect(a.get("b")).toEqual(b.get("b"));
  });

  it("skips superseded events so an override rewrites history", () => {
    const base = [ev(1, "a", 2, days(0)), ev(2, "a", 4, days(1))];
    const bad = replay(base).get("a");
    const fixed = replay([
      ...base,
      ev(3, "a", 1, days(1), { supersedes: base[1]?.id ?? null }),
    ]).get("a");
    expect(bad?.lapses ?? 0).toBeGreaterThanOrEqual(0);
    expect(fixed?.stability ?? 0).toBeGreaterThan(bad?.stability ?? 0);
    expect(fixed?.reps).toBe(2);
  });

  it("equals incremental application (client == server)", () => {
    const events = [
      ev(1, "a", 2, days(0)),
      ev(2, "a", 3, days(1)),
      ev(3, "a", 2, days(3)),
      ev(4, "a", 1, days(9)),
    ];
    let inc = null as ReturnType<typeof applyReview> | null;
    for (const e of events)
      inc = applyReview(inc, e.variantId, e.wordId, e.grade, new Date(e.reviewedAt));
    expect(replay(events).get("a")).toEqual(inc);
  });
});

describe("mastery", () => {
  it("records the day a word first crosses the mastery threshold", () => {
    const events: ReviewEvent[] = [];
    let i = 0;
    let d = 0;
    for (const gap of [0, 1, 3, 7, 15, 30, 60]) {
      d += gap;
      events.push(ev(++i, "a", 1, days(d)));
    }
    const final = replay(events).get("a");
    expect(isMastered(final)).toBe(true);
    const tl = masteryTimeline(events);
    expect(tl.get("w-a")).toBeDefined();
  });
});
