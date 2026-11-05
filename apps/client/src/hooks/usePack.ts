import { useEffect, useState } from "react";
import { onPackState, type PackState, packState } from "@/lib/dict-pack";

export function usePackState(): PackState {
  const [s, setS] = useState<PackState>(packState());
  useEffect(() => onPackState(setS), []);
  return s;
}
