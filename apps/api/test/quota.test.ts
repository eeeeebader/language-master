import { describe, expect, it } from "vitest";
import { GenerationLimiter } from "../src/lib/rateLimit";
import { decideQuota } from "../src/stories/quota";

describe("quota gate", () => {
  it("uses the free story first, then tokens, then refuses", () => {
    expect(decideQuota({ freePerDay: 1, usedToday: 0, tokens: 0 })).toEqual({
      ok: true,
      payment: "free",
    });
    expect(decideQuota({ freePerDay: 1, usedToday: 1, tokens: 3 })).toEqual({
      ok: true,
      payment: "token",
    });
    expect(decideQuota({ freePerDay: 1, usedToday: 1, tokens: 0 })).toEqual({
      ok: false,
      reason: "no_tokens",
    });
    expect(decideQuota({ freePerDay: 0, usedToday: 0, tokens: 1 })).toEqual({
      ok: true,
      payment: "token",
    });
  });
});

describe("generation limiter", () => {
  it("allows one in flight and caps per day", () => {
    const l = new GenerationLimiter(() => 2);
    const r1 = l.acquire("u");
    expect(r1).not.toBeNull();
    expect(l.acquire("u")).toBeNull(); // in flight
    r1?.();
    const r2 = l.acquire("u");
    expect(r2).not.toBeNull();
    r2?.();
    expect(l.acquire("u")).toBeNull(); // daily cap
    l.refundDaily("u");
    expect(l.acquire("u")).not.toBeNull();
    expect(l.acquire("other")).not.toBeNull();
  });
});
