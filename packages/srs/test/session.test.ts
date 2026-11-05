import { describe, expect, it } from "vitest";
import {
  answer,
  createSession,
  currentStep,
  isFinished,
  progressiveLadder,
  regradeLast,
  remaining,
  type SessionCard,
  skip,
  summarise,
} from "../src";

const cards = (n: number): SessionCard[] =>
  Array.from({ length: n }, (_, i) => ({
    variantId: `v${i}`,
    wordId: `w${i}`,
    front: `f${i}`,
    back: `b${i}`,
    pos: "noun",
    isNew: true,
  }));

describe("session planner", () => {
  it("clears cards on Good/Easy and finishes", () => {
    let s = createSession(cards(3), { mode: "classic" }, 0);
    expect(s.current).toBe("v0");
    s = answer(s, 2, 1000);
    s = answer(s, 1, 2000);
    s = answer(s, 2, 3000);
    expect(isFinished(s)).toBe(true);
    expect(s.cleared).toEqual(["v0", "v1", "v2"]);
  });

  it("puts Again cards into a 5-minute retry loop and Hard into 10 minutes", () => {
    let s = createSession(cards(2), { mode: "classic" }, 0);
    s = answer(s, 4, 0);
    expect(s.retry).toEqual([{ variantId: "v0", dueAt: 5 * 60_000 }]);
    s = answer(s, 3, 1000);
    expect(s.retry.find((r) => r.variantId === "v1")?.dueAt).toBe(1000 + 10 * 60_000);
    // queue empty, retries not due: earliest retry is served early rather than stalling
    expect(s.current).toBe("v0");
  });

  it("serves a due retry before the main queue", () => {
    let s = createSession(cards(5), { mode: "classic" }, 0);
    s = answer(s, 4, 0);
    expect(s.current).toBe("v1");
    s = answer(s, 2, 6 * 60_000);
    expect(s.current).toBe("v0");
  });

  it("skips a card after three Again grades", () => {
    let s = createSession(cards(1), { mode: "classic" }, 0);
    s = answer(s, 4, 0);
    s = answer(s, 4, 1);
    s = answer(s, 4, 2);
    expect(s.skipped).toEqual(["v0"]);
    expect(isFinished(s)).toBe(true);
  });

  it("never holds more than the cap in the retry buffer", () => {
    let s = createSession(cards(15), { mode: "classic" }, 0);
    for (let i = 0; i < 15; i++) {
      s = answer(s, 4, i);
      expect(s.retry.length).toBeLessThanOrEqual(10);
    }
    expect(s.skipped.length).toBe(5);
  });

  it("progressive mode requires choice then typing", () => {
    let s = createSession(cards(2), { mode: "progressive" }, 0);
    expect(s.phase.v0).toBe("choice");
    s = answer(s, 2, 0);
    expect(s.phase.v0).toBe("typing");
    expect(s.cleared).toEqual([]);
    // v1 choice, then v0 typing
    s = answer(s, 2, 1);
    expect(s.current).toBe("v0");
    s = answer(s, 2, 2);
    expect(s.cleared).toEqual(["v0"]);
  });

  it("one-tap override rolls back and regrades the last answer", () => {
    let s = createSession(cards(2), { mode: "reaction" }, 0);
    s = answer(s, 4, 0);
    expect(s.retry).toHaveLength(1);
    s = regradeLast(s, 1, 10);
    expect(s.retry).toHaveLength(0);
    expect(s.cleared).toEqual(["v0"]);
    expect(s.answers).toHaveLength(1);
    expect(s.answers[0]?.grade).toBe(1);
  });

  it("skip keeps the card for next time and summarises", () => {
    let s = createSession(cards(2), { mode: "classic" }, 0);
    s = skip(s, 0);
    s = answer(s, 2, 5000);
    expect(remaining(s)).toBe(0);
    const sum = summarise(s, 6000);
    expect(sum.skipped).toEqual(["v0"]);
    expect(sum.cleared).toBe(1);
    expect(sum.durationMs).toBe(6000);
  });
});

describe("progressive ladder", () => {
  it("asks choice from the native language first, then typing target→native, then the rest", () => {
    const cards = [
      {
        variantId: "a",
        wordId: "w1",
        front: "hola",
        back: "hallo",
        pos: "other" as const,
        isNew: true,
      },
    ];
    let s = createSession(cards, { mode: "progressive", ladder: progressiveLadder("both") }, 0);
    expect(currentStep(s)).toEqual({ kind: "choice", dir: "n2t" });
    s = answer(s, 2, 1);
    expect(currentStep(s)).toEqual({ kind: "typing", dir: "t2n" });
    s = answer(s, 3, 2); // Hard: same step, retried later
    expect(isFinished(s)).toBe(false);
    expect(currentStep(s)).toEqual({ kind: "typing", dir: "t2n" });
    s = answer(s, 2, 3);
    expect(currentStep(s)).toEqual({ kind: "choice", dir: "t2n" });
    s = answer(s, 1, 4);
    expect(currentStep(s)).toEqual({ kind: "typing", dir: "n2t" });
    s = answer(s, 2, 5);
    expect(isFinished(s)).toBe(true);
    expect(s.cleared).toEqual(["a"]);
  });
});
