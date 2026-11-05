import { useState } from "react";

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  return {
    msg,
    show: (m: string) => {
      setMsg(m);
      setTimeout(() => setMsg(null), 1800);
    },
  };
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("de-DE") : "–";
export const fmtEur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
