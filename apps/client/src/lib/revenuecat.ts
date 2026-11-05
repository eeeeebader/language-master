/**
 * Store purchases inside the native apps (Apple/Google require IAP for digital goods).
 * RevenueCat's app_user_id is the Supabase user id, so the webhook writes the same
 * entitlements row the web Stripe flow uses; the app never trusts the client for tier.
 */
import { Capacitor } from "@capacitor/core";
import { LOG_LEVEL, Purchases } from "@revenuecat/purchases-capacitor";
import type { Product } from "./billing";

/** Store product identifiers; must match apps/api/src/payments/revenuecat.ts PRODUCT_KINDS. */
export const STORE_PRODUCTS: Record<Exclude<Product, "support">, string> = {
  premium: "premium_unlock",
  tokens_10: "story_tokens_10",
  tokens_50: "story_tokens_50",
};

let configuredFor: string | null = null;

function apiKey(): string | undefined {
  const platform = Capacitor.getPlatform();
  if (platform === "ios") return import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;
  if (platform === "android")
    return import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined;
  return undefined;
}

export const storeEnabled = Capacitor.isNativePlatform() && !!apiKey();

/** Configure once per signed-in user; safe to call repeatedly. */
export async function configureStore(userId: string): Promise<boolean> {
  const key = apiKey();
  if (!key) return false;
  if (configuredFor === userId) return true;
  await Purchases.setLogLevel({ level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN });
  await Purchases.configure({ apiKey: key, appUserID: userId });
  configuredFor = userId;
  return true;
}

export type StoreResult =
  | { ok: true; cancelled?: false }
  | { ok: false; cancelled: boolean; error: string };

/** Buy one product through the store; the RevenueCat webhook grants it server-side. */
export async function purchaseStoreProduct(
  product: Exclude<Product, "support">,
): Promise<StoreResult> {
  try {
    const { products } = await Purchases.getProducts({
      productIdentifiers: [STORE_PRODUCTS[product]],
    });
    const p = products[0];
    if (!p) return { ok: false, cancelled: false, error: "product_not_found" };
    await Purchases.purchaseStoreProduct({ product: p });
    return { ok: true };
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    return { ok: false, cancelled: !!err.userCancelled, error: err.message ?? String(e) };
  }
}

export async function restoreStorePurchases(): Promise<StoreResult> {
  try {
    await Purchases.restorePurchases();
    return { ok: true };
  } catch (e) {
    return { ok: false, cancelled: false, error: (e as Error).message ?? String(e) };
  }
}
