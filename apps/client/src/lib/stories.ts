import type { StoryDocument, StoryRequest } from "@lm/schema";
import { db } from "@/db/db";
import { API_URL, getAccessToken, isCloudEnabled } from "./auth";

export type GenerateOutcome =
  | { ok: true; storyId: string; payment: string; coverage: number }
  | { ok: false; error: string; reason?: string; refunded?: boolean };

/** POST /stories/generate and store the returned document locally for offline reading. */
export async function generateStory(request: StoryRequest): Promise<GenerateOutcome> {
  if (!isCloudEnabled) return { ok: false, error: "offline" };
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "signed_out" };
  let res: Response;
  try {
    res = await fetch(`${API_URL}/stories/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, error: "network" };
  }
  const body = (await res.json().catch(() => ({}))) as {
    story?: StoryDocument;
    payment?: string;
    coverage?: number;
    error?: string;
    reason?: string;
  };
  if (!res.ok || !body.story)
    return { ok: false, error: body.error ?? `http_${res.status}`, reason: body.reason };
  await db.stories.put({ ...body.story, archived: false });
  return {
    ok: true,
    storyId: body.story.id,
    payment: body.payment ?? "free",
    coverage: body.coverage ?? 0,
  };
}

export const GENERATE_ERRORS: Record<string, string> = {
  offline: "Nur lokal: melde dich im Profil an, um Geschichten zu erstellen.",
  signed_out: "Bitte zuerst im Profil anmelden.",
  network: "Keine Verbindung zum Server.",
  rate_limited:
    "Bitte warte kurz – eine Geschichte ist noch in Arbeit oder das Tageslimit ist erreicht.",
  no_tokens: "Die freie Geschichte für heute ist verbraucht und du hast keine Tokens.",
  daily_free_used: "Die freie Geschichte für heute ist verbraucht und du hast keine Tokens.",
  generation_failed: "Die Erstellung ist fehlgeschlagen. Bitte versuche es noch einmal.",
  generation_failed_refunded: "Die Erstellung ist fehlgeschlagen; dein Token wurde gutgeschrieben.",
  maintenance: "Wartung – bitte später noch einmal versuchen.",
};
