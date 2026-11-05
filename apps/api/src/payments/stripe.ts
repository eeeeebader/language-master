import Stripe from "stripe";
import type { PurchaseKind } from "./entitlements";

export interface StripePrices {
  premium?: string;
  tokens10?: string;
  tokens50?: string;
}

export function kindForPrice(
  priceId: string | null | undefined,
  prices: StripePrices,
): PurchaseKind | null {
  if (!priceId) return null;
  if (priceId === prices.premium) return "premium";
  if (priceId === prices.tokens10) return "tokens_10";
  if (priceId === prices.tokens50) return "tokens_50";
  return null;
}

/**
 * Map a Checkout session into purchases. Premium and token packs are identified by price id;
 * anything else in payment mode with our `support` metadata is a support payment.
 */
export function purchasesFromSession(
  session: Stripe.Checkout.Session,
  lineItems: Stripe.LineItem[],
  prices: StripePrices,
) {
  const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
  if (!userId) return [];
  const out: { userId: string; kind: PurchaseKind; refId: string; amountCents: number }[] = [];
  for (const li of lineItems) {
    const kind =
      kindForPrice(li.price?.id, prices) ??
      (session.metadata?.kind === "support" ? "support" : null);
    if (!kind) continue;
    out.push({ userId, kind, refId: `${session.id}:${li.id}`, amountCents: li.amount_total ?? 0 });
  }
  return out;
}

export function createStripe(secretKey: string) {
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion });
}
