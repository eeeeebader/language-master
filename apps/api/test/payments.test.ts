import { describe, expect, it } from "vitest";
import { purchaseFromRevenueCat, RevenueCatEvent } from "../src/payments/revenuecat";
import { kindForPrice } from "../src/payments/stripe";

describe("payments mapping", () => {
  it("maps Stripe price ids to product kinds", () => {
    const prices = { premium: "price_p", tokens10: "price_10", tokens50: "price_50" };
    expect(kindForPrice("price_p", prices)).toBe("premium");
    expect(kindForPrice("price_50", prices)).toBe("tokens_50");
    expect(kindForPrice("price_x", prices)).toBeNull();
  });

  it("maps RevenueCat purchases and ignores other event types", () => {
    const base = {
      id: "e1",
      app_user_id: "user-uuid",
      product_id: "story_tokens_10",
      store: "PLAY_STORE",
      transaction_id: "tx1",
      price_in_purchased_currency: 2.99,
    };
    const p = purchaseFromRevenueCat(
      RevenueCatEvent.parse({ event: { ...base, type: "NON_RENEWING_PURCHASE" } }),
    );
    expect(p).toMatchObject({
      userId: "user-uuid",
      kind: "tokens_10",
      source: "google",
      refId: "tx1",
      amountCents: 299,
    });
    expect(
      purchaseFromRevenueCat(RevenueCatEvent.parse({ event: { ...base, type: "CANCELLATION" } })),
    ).toBeNull();
  });
});
