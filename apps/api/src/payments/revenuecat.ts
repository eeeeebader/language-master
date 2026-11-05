import { z } from "zod";
import type { PurchaseKind, PurchaseSource } from "./entitlements";

/** Subset of the RevenueCat webhook payload we act on. */
export const RevenueCatEvent = z.object({
  event: z.object({
    type: z.string(),
    id: z.string(),
    app_user_id: z.string(),
    product_id: z.string(),
    store: z.string().optional(),
    transaction_id: z.string().optional(),
    price_in_purchased_currency: z.number().optional(),
  }),
});

const PRODUCT_KINDS: Record<string, PurchaseKind> = {
  premium_unlock: "premium",
  story_tokens_10: "tokens_10",
  story_tokens_50: "tokens_50",
};

export function purchaseFromRevenueCat(payload: z.infer<typeof RevenueCatEvent>) {
  const e = payload.event;
  if (!["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE", "RENEWAL"].includes(e.type)) return null;
  const kind = PRODUCT_KINDS[e.product_id];
  if (!kind) return null;
  const source: PurchaseSource = e.store === "PLAY_STORE" ? "google" : "apple";
  return {
    userId: e.app_user_id,
    kind,
    source,
    refId: e.transaction_id ?? e.id,
    amountCents: Math.round((e.price_in_purchased_currency ?? 0) * 100),
  };
}
