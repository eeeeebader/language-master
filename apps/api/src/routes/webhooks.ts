import type { Db } from "@lm/database";
import { Hono } from "hono";
import type { Env } from "../env";
import { log } from "../lib/log";
import { applyPurchase } from "../payments/entitlements";
import { purchaseFromRevenueCat, RevenueCatEvent } from "../payments/revenuecat";
import { createStripe, purchasesFromSession } from "../payments/stripe";

export function webhookRoutes(db: Db, env: Env) {
  const app = new Hono();

  app.post("/stripe", async (c) => {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)
      return c.json({ error: "stripe not configured" }, 503);
    const stripe = createStripe(env.STRIPE_SECRET_KEY);
    const sig = c.req.header("stripe-signature") ?? "";
    const raw = await c.req.text();
    let event: ReturnType<typeof stripe.webhooks.constructEvent>;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      log.warn("stripe signature invalid", { error: String(e) });
      return c.json({ error: "bad signature" }, 400);
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
      const purchases = purchasesFromSession(session, items.data, {
        premium: env.STRIPE_PRICE_PREMIUM,
        tokens10: env.STRIPE_PRICE_TOKENS_10,
        tokens50: env.STRIPE_PRICE_TOKENS_50,
      });
      for (const p of purchases) await applyPurchase(db, { ...p, source: "stripe" });
      log.info("stripe checkout applied", { session: session.id, purchases: purchases.length });
    }
    return c.json({ received: true });
  });

  app.post("/revenuecat", async (c) => {
    if (!env.REVENUECAT_WEBHOOK_SECRET) return c.json({ error: "revenuecat not configured" }, 503);
    const auth = c.req.header("authorization") ?? "";
    if (auth !== `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`)
      return c.json({ error: "unauthorized" }, 401);
    const parsed = RevenueCatEvent.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid payload" }, 400);
    const purchase = purchaseFromRevenueCat(parsed.data);
    if (purchase) {
      await applyPurchase(db, purchase);
      log.info("revenuecat purchase applied", { kind: purchase.kind, user: purchase.userId });
    }
    return c.json({ received: true });
  });

  return app;
}
