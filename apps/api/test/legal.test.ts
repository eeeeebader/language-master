import { describe, expect, it } from "vitest";
import { pendingConsents } from "../src/routes/legal";

describe("pending consents", () => {
  const current = {
    agb: { version: 3, requires_reconsent: true },
    privacy: { version: 2, requires_reconsent: false },
    impressum: { version: 5, requires_reconsent: false },
  };
  it("requires anything never accepted, and newer versions only when flagged", () => {
    expect(pendingConsents(current, {})).toEqual(["agb", "privacy"]);
    expect(pendingConsents(current, { agb: 2, privacy: 1 })).toEqual(["agb"]);
    expect(pendingConsents(current, { agb: 3, privacy: 1 })).toEqual([]);
  });
  it("never asks for the Impressum", () => {
    expect(pendingConsents({ impressum: { version: 9, requires_reconsent: true } }, {})).toEqual(
      [],
    );
  });
});
