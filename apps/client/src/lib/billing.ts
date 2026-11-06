import { Capacitor } from "@capacitor/core";
import { API_URL, getAccessToken, getSession, isCloudEnabled } from "./auth";
import {
  configureStore,
  purchaseStoreProduct,
  restoreStorePurchases,
  storeEnabled,
} from "./revenuecat";

export interface Billing {
  is_premium: boolean;
  story_tokens: number;
  is_supporter: boolean;
  free_per_day: number;
  used_today: number;
  free_left: number;
  active_story_limit: number;
  active_languages_limit: number;
  prices: {
    premium_cents: number;
    tokens_10_cents: number;
    tokens_50_cents: number;
    support_cents: number[];
  };
  stripe_enabled: boolean;
  /** Server is in field-test mode: every purchase is granted without payment. */
  field_test?: boolean;
}

export type Product = "premium" | "tokens_10" | "tokens_50" | "support";

/** Local-only defaults so the UI renders without a server. */
export const LOCAL_BILLING: Billing = {
  is_premium: false,
  story_tokens: 0,
  is_supporter: false,
  free_per_day: 1,
  used_today: 0,
  free_left: 1,
  active_story_limit: 2,
  active_languages_limit: 1,
  prices: {
    premium_cents: 1299,
    tokens_10_cents: 299,
    tokens_50_cents: 999,
    support_cents: [300, 500, 1000, 2500],
  },
  stripe_enabled: false,
};

async function authed(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("signed_out");
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

export async function fetchBilling(): Promise<Billing> {
  if (!isCloudEnabled) return LOCAL_BILLING;
  try {
    const res = await authed("/billing/me");
    if (!res.ok) return LOCAL_BILLING;
    return (await res.json()) as Billing;
  } catch {
    return LOCAL_BILLING;
  }
}

/** Store rules: purchases inside the native apps go through the stores (RevenueCat), not Stripe. */
export const isNativeApp = Capacitor.isNativePlatform();

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: true; url?: undefined; store: true }
  | { ok: false; error: string; cancelled?: boolean };

/** Native: store purchase via RevenueCat; the server learns about it through the webhook. */
async function storeCheckout(product: Product): Promise<CheckoutResult> {
  if (product === "support") return { ok: false, error: "support_web_only" };
  const session = await getSession();
  if (!session) return { ok: false, error: "signed_out" };
  if (!(await configureStore(session.user.id))) return { ok: false, error: "native" };
  const r = await purchaseStoreProduct(product);
  if (r.ok) return { ok: true, store: true };
  return { ok: false, error: r.cancelled ? "cancelled" : r.error, cancelled: r.cancelled };
}

export async function restorePurchases(): Promise<CheckoutResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "signed_out" };
  if (!(await configureStore(session.user.id))) return { ok: false, error: "native" };
  const r = await restoreStorePurchases();
  return r.ok ? { ok: true, store: true } : { ok: false, error: r.error };
}

export async function startCheckout(
  product: Product,
  amountCents?: number,
): Promise<CheckoutResult> {
  if (isNativeApp) return storeEnabled ? storeCheckout(product) : { ok: false, error: "native" };
  if (!isCloudEnabled) return { ok: false, error: "offline" };
  try {
    const returnUrl = `${window.location.origin}${window.location.pathname}`;
    const res = await authed("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ product, amount_cents: amountCents, return_url: returnUrl }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) return { ok: false, error: body.error ?? `http_${res.status}` };
    return { ok: true, url: body.url };
  } catch {
    return { ok: false, error: "network" };
  }
}

export const euro = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

export const CHECKOUT_ERRORS: Record<string, string> = {
  native:
    "In der App laufen Käufe über den App Store bzw. Google Play (folgt mit dem Store-Release).",
  offline: "Melde dich im Profil an, um Premium oder Tokens zu kaufen.",
  signed_out: "Bitte zuerst im Profil anmelden.",
  stripe_not_configured: "Zahlungen sind auf diesem Server noch nicht eingerichtet.",
  already_premium: "Du hast Premium bereits.",
  network: "Keine Verbindung zum Server.",
};
