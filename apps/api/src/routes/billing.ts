import { type Db, stories } from "@lm/database";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { log } from "../lib/log";
import { checkoutParams, SUPPORT_AMOUNTS_CENTS, summarise } from "../payments/checkout";
import { getEntitlement } from "../payments/entitlements";
import { createStripe } from "../payments/stripe";
import type { SettingsStore } from "../settings";

function startOfUtcDay(now: Date) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Tier, tokens and today's free-story quota; Stripe Checkout for web purchases. */
export function billingRoutes(db: Db, env: Env, settings: SettingsStore) {
  const app = new Hono();
  const stripeEnabled = !!env.STRIPE_SECRET_KEY;

  app.get("/me", async (c) => {
    const user = c.get("user");
    const [ent, freePerDay, used, freeStories, premiumStories, s] = await Promise.all([
      getEntitlement(db, user.id),
      settings.get("stories.free_per_day", 1),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(stories)
        .where(
          and(
            eq(stories.userId, user.id),
            eq(stories.source, "ai"),
            gte(stories.createdAt, startOfUtcDay(new Date())),
            isNull(stories.deletedAt),
            sql`${stories.status} <> 'failed'`,
          ),
        ),
      settings.get("stories.free_active", 2),
      settings.get("stories.premium_archive", 50),
      settings.all(),
    ]);
    return c.json({
      ...summarise(ent, freePerDay, used[0]?.n ?? 0, { freeStories, premiumStories }),
      prices: {
        premium_cents: Number(s["pricing.premium_cents"] ?? 1299),
        tokens_10_cents: Number(s["pricing.tokens_10_cents"] ?? 299),
        tokens_50_cents: Number(s["pricing.tokens_50_cents"] ?? 999),
        support_cents: SUPPORT_AMOUNTS_CENTS,
      },
      stripe_enabled: stripeEnabled,
    });
  });

  app.post("/checkout", async (c) => {
    if (!env.STRIPE_SECRET_KEY) return c.json({ error: "stripe_not_configured" }, 503);
    const user = c.get("user");
    const parsed = z
      .object({
        product: z.enum(["premium", "tokens_10", "tokens_50", "support"]),
        amount_cents: z.number().int().optional(),
        return_url: z.string().url(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request" }, 400);
    const { product, amount_cents, return_url } = parsed.data;
    const allowed = env.CORS_ORIGINS.split(",").map((o) => o.trim());
    if (!allowed.some((o) => return_url.startsWith(o)))
      return c.json({ error: "bad return_url" }, 400);
    if (product === "premium" && (await getEntitlement(db, user.id))?.isPremium)
      return c.json({ error: "already_premium" }, 409);
    try {
      const params = checkoutParams({
        product,
        userId: user.id,
        email: user.email,
        prices: {
          premium: env.STRIPE_PRICE_PREMIUM,
          tokens10: env.STRIPE_PRICE_TOKENS_10,
          tokens50: env.STRIPE_PRICE_TOKENS_50,
        },
        returnUrl: return_url,
        amountCents: amount_cents,
      });
      const session = await createStripe(env.STRIPE_SECRET_KEY).checkout.sessions.create(params);
      log.info("checkout session created", { user: user.id, product });
      return c.json({ url: session.url });
    } catch (e) {
      log.error("checkout failed", { error: String(e) });
      return c.json({ error: "checkout_failed" }, 502);
    }
  });

  return app;
}
