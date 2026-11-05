import type Stripe from "stripe";
import type { PurchaseKind } from "./entitlements";
import type { StripePrices } from "./stripe";

export type Product = Exclude<PurchaseKind, "support"> | "support";

/** § 356 Abs. 5 BGB: the buyer agrees to immediate delivery and confirms the loss of withdrawal. */
export const WITHDRAWAL_CONSENT_DE =
  "Ich stimme ausdrücklich zu, dass die Lieferung des digitalen Inhalts sofort beginnt, und bestätige, dass ich dadurch mein Widerrufsrecht verliere. Es gelten die [AGB](https://languagemaster.app/agb).";

export const SUPPORT_AMOUNTS_CENTS = [300, 500, 1000, 2500] as const;

export interface CheckoutInput {
  product: Product;
  userId: string;
  email: string | null;
  prices: StripePrices;
  returnUrl: string;
  /** support only */
  amountCents?: number;
}

/** Pure: Checkout session parameters for one product. Throws when the price is not configured. */
export function checkoutParams(i: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  const url = new URL(i.returnUrl);
  const success = new URL(url);
  success.searchParams.set("checkout", "success");
  const cancel = new URL(url);
  cancel.searchParams.set("checkout", "cancel");

  const base: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    client_reference_id: i.userId,
    customer_email: i.email ?? undefined,
    metadata: { user_id: i.userId, kind: i.product },
    success_url: success.toString(),
    cancel_url: cancel.toString(),
    automatic_tax: { enabled: true },
    locale: "de",
    consent_collection: { terms_of_service: "required" },
    custom_text: { terms_of_service_acceptance: { message: WITHDRAWAL_CONSENT_DE } },
  };

  if (i.product === "support") {
    const amount = i.amountCents ?? 500;
    if (!SUPPORT_AMOUNTS_CENTS.includes(amount as (typeof SUPPORT_AMOUNTS_CENTS)[number]))
      throw new Error("invalid support amount");
    return {
      ...base,
      // Business income, not a donation: "Unterstützung", never "Spende".
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amount,
            product_data: { name: "Unterstützung für Language Master" },
            tax_behavior: "inclusive",
          },
        },
      ],
      submit_type: "pay",
      // Support is not a digital content purchase: no withdrawal clause needed.
      consent_collection: undefined,
      custom_text: undefined,
    };
  }

  const price =
    i.product === "premium"
      ? i.prices.premium
      : i.product === "tokens_10"
        ? i.prices.tokens10
        : i.prices.tokens50;
  if (!price) throw new Error(`price not configured for ${i.product}`);
  return { ...base, line_items: [{ price, quantity: 1 }] };
}

export interface EntitlementSummary {
  is_premium: boolean;
  story_tokens: number;
  is_supporter: boolean;
  free_per_day: number;
  used_today: number;
  free_left: number;
  active_story_limit: number;
  active_languages_limit: number;
}

/** Pure: what the client needs to render quotas and tier. */
export function summarise(
  ent: { isPremium: boolean; storyTokens: number; isSupporter: boolean } | null,
  freePerDay: number,
  usedToday: number,
  limits: { freeStories: number; premiumStories: number },
): EntitlementSummary {
  const premium = ent?.isPremium ?? false;
  return {
    is_premium: premium,
    story_tokens: ent?.storyTokens ?? 0,
    is_supporter: ent?.isSupporter ?? false,
    free_per_day: freePerDay,
    used_today: usedToday,
    free_left: Math.max(0, freePerDay - usedToday),
    active_story_limit: premium ? limits.premiumStories : limits.freeStories,
    active_languages_limit: premium ? 5 : 1,
  };
}
