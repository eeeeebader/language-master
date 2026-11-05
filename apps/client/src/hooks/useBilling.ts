import { useCallback, useEffect, useState } from "react";
import { type Billing, fetchBilling, LOCAL_BILLING } from "@/lib/billing";

/** Tier, tokens and today's quota; refetches on focus and after a checkout return. */
export function useBilling() {
  const [billing, setBilling] = useState<Billing>(LOCAL_BILLING);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setBilling(await fetchBilling());
    setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  return { billing, loading, refresh };
}
