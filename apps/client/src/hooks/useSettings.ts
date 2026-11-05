import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";

/** undefined = still loading, null = no settings row (onboarding needed). */
export function useSettings() {
  return useLiveQuery(async () => (await db.settings.get("me")) ?? null, []);
}
