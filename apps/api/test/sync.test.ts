import { describe, expect, it } from "vitest";
import { lwwWins, nextCursor, PushBody, parseCursor, partitionEvents } from "../src/sync/logic";

const ev = (id: string, wordId = "w1") => ({
  id,
  wordId,
  variantId: "v1",
  grade: 2 as const,
  reactionMs: 1000,
  mode: "classic" as const,
  promptKind: null,
  reviewedAt: "2026-11-05T10:00:00.000Z",
  supersedes: null,
  manual: true,
});

describe("sync push", () => {
  it("is idempotent on ulid and dedupes within one batch", () => {
    const r = partitionEvents([ev("A"), ev("B", "w2"), ev("A"), ev("C")], new Set(["C"]));
    expect(r.fresh.map((e) => e.id)).toEqual(["A", "B"]);
    expect(r.duplicates).toEqual(["A", "C"]);
    expect(r.affectedWordIds).toEqual(["w1", "w2"]);
  });

  it("validates the wire body with defaults", () => {
    const p = PushBody.parse({ events: [ev("A")] });
    expect(p.lists).toEqual([]);
    expect(p.settings).toBeNull();
    expect(PushBody.safeParse({ events: [{ ...ev("A"), grade: 7 }] }).success).toBe(false);
  });

  it("LWW keeps the newer row", () => {
    expect(lwwWins("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(true);
    expect(lwwWins("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")).toBe(false);
    expect(lwwWins("2026-01-01T00:00:00Z", null)).toBe(true);
  });
});

describe("sync pull cursor", () => {
  it("treats missing or invalid cursors as the epoch", () => {
    expect(parseCursor(undefined).getTime()).toBe(0);
    expect(parseCursor("nope").getTime()).toBe(0);
    expect(parseCursor("2026-11-05T00:00:00.000Z").toISOString()).toBe("2026-11-05T00:00:00.000Z");
  });

  it("advances to the newest updatedAt and never goes backwards", () => {
    const prev = new Date("2026-11-01T00:00:00Z");
    expect(
      nextCursor(
        [{ updatedAt: "2026-11-03T00:00:00Z" }, { updatedAt: new Date("2026-11-02T00:00:00Z") }],
        prev,
      ),
    ).toBe("2026-11-03T00:00:00.000Z");
    expect(nextCursor([], prev)).toBe(prev.toISOString());
  });
});
