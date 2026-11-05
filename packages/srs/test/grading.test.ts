import { describe, expect, it } from "vitest";
import {
  answersMatch,
  calibrateBase,
  editDistance,
  fuzzyMatch,
  gradeByLength,
  gradeByProfile,
  inferGrade,
  lengthThresholdMs,
  pickDistractors,
  updateProfile,
} from "../src";

describe("reaction-time grading", () => {
  it("threshold grows with word length", () => {
    expect(lengthThresholdMs(5)).toBe(1500 + 450);
    expect(lengthThresholdMs(10)).toBeGreaterThan(lengthThresholdMs(5));
  });

  it("grades by multiples of the threshold", () => {
    const t = lengthThresholdMs(5);
    expect(gradeByLength(t - 1, true, 5)).toBe(1);
    expect(gradeByLength(t * 1.5, true, 5)).toBe(2);
    expect(gradeByLength(t * 3, true, 5)).toBe(3);
    expect(gradeByLength(t * 5, true, 5)).toBe(4);
    expect(gradeByLength(100, false, 5)).toBe(4);
  });

  it("grades by profile once a word has three measurements", () => {
    expect(gradeByProfile(700, true, 1000)).toBe(1);
    expect(gradeByProfile(1100, true, 1000)).toBe(2);
    expect(gradeByProfile(1900, true, 1000)).toBe(3);
    expect(gradeByProfile(2500, true, 1000)).toBe(4);
    expect(
      inferGrade({
        reactionMs: 700,
        correct: true,
        answerLength: 5,
        profile: { emaMs: 1000, n: 2 },
      }),
    ).toBe(1);
    expect(
      inferGrade({
        reactionMs: 1900,
        correct: true,
        answerLength: 5,
        profile: { emaMs: 1000, n: 3 },
      }),
    ).toBe(3);
    expect(
      inferGrade({
        reactionMs: 1900,
        correct: true,
        answerLength: 5,
        profile: { emaMs: 1000, n: 2 },
      }),
    ).toBe(1);
  });

  it("EMA weighs the new answer 30 %", () => {
    const p1 = updateProfile(undefined, "v", "choice", 2000);
    expect(p1).toEqual({ variantId: "v", promptKind: "choice", emaMs: 2000, n: 1 });
    const p2 = updateProfile(p1, "v", "choice", 1000);
    expect(p2.emaMs).toBe(1700);
    expect(p2.n).toBe(2);
  });

  it("calibrates the base from the median of recent answers", () => {
    expect(calibrateBase([])).toBe(1500);
    const slow = Array.from({ length: 20 }, () => ({ reactionMs: 4000, answerLength: 5 }));
    expect(calibrateBase(slow)).toBe(4000 - 450);
    const absurd = Array.from({ length: 20 }, () => ({ reactionMs: 60_000, answerLength: 5 }));
    expect(calibrateBase(absurd)).toBe(6000);
  });
});

describe("text", () => {
  it("accepts accent-free and article-free typing", () => {
    expect(answersMatch("corazon", "corazón")).toBe(true);
    expect(answersMatch("perro", "el perro")).toBe(true);
    expect(answersMatch("Hund", "der Hund")).toBe(true);
    expect(answersMatch("hund", "Hund, Köter")).toBe(true);
    expect(answersMatch("gato", "perro")).toBe(false);
    expect(answersMatch("", "perro")).toBe(false);
  });

  it("fuzzy prefix search ignores accents and tolerates one typo", () => {
    expect(fuzzyMatch("encant", "encantado")).toBe(true);
    expect(fuzzyMatch("corazon", "corazón")).toBe(true);
    expect(fuzzyMatch("perrp", "perro")).toBe(true);
    expect(fuzzyMatch("xyz", "perro")).toBe(false);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  it("picks distractors with the same POS and no duplicates of the answer", () => {
    const pool = [
      { id: "1", pos: "noun", back: "Hund" },
      { id: "2", pos: "noun", back: "Katze" },
      { id: "3", pos: "noun", back: "Haus" },
      { id: "4", pos: "verb", back: "laufen" },
      { id: "5", pos: "noun", back: "hund" },
    ];
    const d = pickDistractors(pool[0] as (typeof pool)[number], pool, 3, () => 0.5);
    expect(d).toHaveLength(3);
    expect(d.map((x) => x.back)).not.toContain("Hund");
    expect(d.map((x) => x.back)).not.toContain("hund");
  });
});
