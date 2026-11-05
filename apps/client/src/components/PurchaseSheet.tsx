import { Coins, Heart, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";
import {
  type Billing,
  CHECKOUT_ERRORS,
  euro,
  isNativeApp,
  type Product,
  restorePurchases,
  startCheckout,
} from "@/lib/billing";
import { Button, Card, Chip, Sheet } from "./ui";

export function PurchaseSheet({
  open,
  onClose,
  billing,
  reason,
  onPurchased,
}: {
  open: boolean;
  onClose: () => void;
  billing: Billing;
  reason?: string;
  onPurchased?: () => void;
}) {
  const [busy, setBusy] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<number>(billing.prices.support_cents[1] ?? 500);

  async function buy(product: Product, amount?: number) {
    setBusy(product);
    setError(null);
    const r = await startCheckout(product, amount);
    setBusy(null);
    if (r.ok && r.url) window.location.href = r.url;
    else if (r.ok) {
      onPurchased?.();
      onClose();
    } else setError(CHECKOUT_ERRORS[r.error] ?? r.error);
  }

  async function restore() {
    setError(null);
    const r = await restorePurchases();
    if (r.ok) {
      onPurchased?.();
      setError("Käufe wiederhergestellt.");
    } else setError(CHECKOUT_ERRORS[r.error] ?? r.error);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Premium & Tokens">
      {reason && (
        <p className="mb-3 rounded-card bg-amber-soft p-3 text-sm text-amber-deep">{reason}</p>
      )}
      <p className="mb-3 text-sm text-ink-2">
        Heute:{" "}
        {billing.free_left > 0
          ? `${billing.free_left} freie Geschichte`
          : "freie Geschichte verbraucht"}{" "}
        · {billing.story_tokens} Tokens
        {billing.is_premium && " · Premium"}
      </p>
      <div className="grid gap-2">
        {!billing.is_premium && (
          <Card tone="lavender" className="border-transparent">
            <div className="flex items-start gap-3">
              <Sparkle size={24} className="mt-0.5 text-lavender-deep" />
              <div className="flex-1">
                <div className="font-bold">
                  Premium · einmalig {euro(billing.prices.premium_cents)}
                </div>
                <div className="text-sm text-ink-2">
                  5 Sprachen gleichzeitig, Archiv mit 50 Geschichten je Sprache, 25 Tokens
                  inklusive. Gilt für dein Konto auf allen Geräten.
                </div>
              </div>
            </div>
            <Button full className="mt-3" disabled={busy !== null} onClick={() => buy("premium")}>
              {busy === "premium" ? "…" : "Premium freischalten"}
            </Button>
          </Card>
        )}
        <Card tone="amber" className="border-transparent">
          <div className="flex items-start gap-3">
            <Coins size={24} className="mt-0.5 text-amber-deep" />
            <div className="flex-1">
              <div className="font-bold">Geschichten-Tokens</div>
              <div className="text-sm text-ink-2">
                Eine zusätzliche Geschichte je Token. Bei Fehlschlag wird der Token gutgeschrieben.
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy !== null} onClick={() => buy("tokens_10")}>
              10 · {euro(billing.prices.tokens_10_cents)}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => buy("tokens_50")}>
              50 · {euro(billing.prices.tokens_50_cents)}
            </Button>
          </div>
        </Card>
        {!isNativeApp && (
          <Card tone="rose" className="border-transparent">
            <div className="flex items-start gap-3">
              <Heart size={24} className="mt-0.5 text-rose-deep" />
              <div className="flex-1">
                <div className="font-bold">Unterstützung</div>
                <div className="text-sm text-ink-2">
                  Hilft, Server- und KI-Kosten für kostenlose Nutzer zu tragen. Du bekommst ein
                  Supporter-Abzeichen.
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {billing.prices.support_cents.map((c) => (
                <Chip key={c} active={support === c} onClick={() => setSupport(c)}>
                  {euro(c)}
                </Chip>
              ))}
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => buy("support", support)}
              >
                Unterstützen
              </Button>
            </div>
          </Card>
        )}
      </div>
      {error && (
        <p className="mt-3 rounded-card bg-rose-soft p-3 text-sm text-rose-deep">{error}</p>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Preise inkl. MwSt. Die Zahlung läuft über Stripe. Vor dem Kauf digitaler Inhalte stimmst du
        der sofortigen Lieferung zu und verlierst damit dein Widerrufsrecht (§ 356 Abs. 5 BGB).
        {isNativeApp && " In der App laufen Käufe über die Stores."}
      </p>
    </Sheet>
  );
}
