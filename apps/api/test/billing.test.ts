import { describe, expect, it } from "vitest";
import { checkoutParams, summarise, WITHDRAWAL_CONSENT_DE } from "../src/payments/checkout";

const prices = { premium: "price_premium", tokens10: "price_t10", tokens50: "price_t50" };

describe("checkout params", () => {
  it("builds a premium session with the withdrawal consent and return urls", () => {
    const p = checkoutParams({
      product: "premium",
      userId: "u1",
      email: "a@b.c",
      prices,
      returnUrl: "http://localhost:5173/stories",
    });
    expect(p.mode).toBe("payment");
    expect(p.line_items?.[0]?.price).toBe("price_premium");
    expect(p.client_reference_id).toBe("u1");
    expect(p.success_url).toBe("http://localhost:5173/stories?checkout=success");
    expect(p.cancel_url).toBe("http://localhost:5173/stories?checkout=cancel");
    expect(p.consent_collection?.terms_of_service).toBe("required");
    const tos = p.custom_text?.terms_of_service_acceptance as { message: string } | undefined;
    expect(tos?.message).toBe(WITHDRAWAL_CONSENT_DE);
    expect(p.automatic_tax?.enabled).toBe(true);
  });

  it("support uses an ad-hoc price, is called Unterstützung and needs no withdrawal consent", () => {
    const p = checkoutParams({
      product: "support",
      userId: "u1",
      email: null,
      prices,
      returnUrl: "http://localhost:5173/profile",
      amountCents: 500,
    });
    const li = p.line_items?.[0];
    expect(li?.price_data?.unit_amount).toBe(500);
    expect(li?.price_data?.product_data?.name).toContain("Unterstützung");
    expect(li?.price_data?.product_data?.name).not.toMatch(/spende/i);
    expect(p.consent_collection).toBeUndefined();
    expect(() =>
      checkoutParams({
        product: "support",
        userId: "u1",
        email: null,
        prices,
        returnUrl: "http://x/",
        amountCents: 123,
      }),
    ).toThrow();
  });

  it("refuses products without a configured price", () => {
    expect(() =>
      checkoutParams({
        product: "tokens_50",
        userId: "u1",
        email: null,
        prices: {},
        returnUrl: "http://x/",
      }),
    ).toThrow(/price not configured/);
  });
});

describe("entitlement summary", () => {
  it("derives free-left and tier limits", () => {
    const free = summarise(null, 1, 1, { freeStories: 2, premiumStories: 50 });
    expect(free).toMatchObject({
      is_premium: false,
      free_left: 0,
      active_story_limit: 2,
      active_languages_limit: 1,
    });
    const prem = summarise({ isPremium: true, storyTokens: 7, isSupporter: true }, 1, 0, {
      freeStories: 2,
      premiumStories: 50,
    });
    expect(prem).toMatchObject({
      is_premium: true,
      story_tokens: 7,
      free_left: 1,
      active_story_limit: 50,
      active_languages_limit: 5,
    });
  });
});
