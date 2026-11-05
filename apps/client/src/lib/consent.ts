/**
 * Versioned consent. Onboarding records acceptance of the bundled drafts locally (version 1).
 * Signed in, the server decides: documents never accepted there are recorded from the local
 * consent when the versions match; a newer version flagged "requires re-consent" blocks the app
 * until accepted (AGB § 11).
 */
import { db } from "@/db/db";
import { API_URL, getAccessToken, isCloudEnabled } from "./auth";

export interface LegalDoc {
  version: number;
  markdown: string;
  requires_reconsent: boolean;
  published_at: string;
}
export type LegalCurrent = Partial<Record<"agb" | "privacy" | "impressum", LegalDoc>>;

export interface ConsentStatus {
  pending: ("agb" | "privacy")[];
  current: LegalCurrent;
}

type Listener = (p: ("agb" | "privacy")[]) => void;
const listeners = new Set<Listener>();
let pending: ("agb" | "privacy")[] = [];
let current: LegalCurrent = {};

export function onPendingConsent(cb: Listener): () => void {
  listeners.add(cb);
  cb(pending);
  return () => listeners.delete(cb);
}
export function pendingConsent() {
  return pending;
}
export function currentLegal() {
  return current;
}

function set(p: ("agb" | "privacy")[]) {
  pending = p;
  for (const l of listeners) l(p);
}

/** Public texts, used by the legal pages when online. */
export async function fetchLegal(): Promise<LegalCurrent> {
  if (!API_URL) return {};
  try {
    const res = await fetch(`${API_URL}/legal/current?locale=de`, { cache: "no-cache" });
    if (!res.ok) return {};
    const body = (await res.json()) as { documents: LegalCurrent };
    current = body.documents;
    return current;
  } catch {
    return {};
  }
}

async function authed(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) return null;
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

export async function recordConsent(
  document: "agb" | "privacy",
  version: number,
): Promise<boolean> {
  const res = await authed("/account/consents", {
    method: "POST",
    body: JSON.stringify({ document, version }),
  });
  return !!res?.ok;
}

let inFlight: Promise<("agb" | "privacy")[]> | null = null;

/** Run at launch and after sign-in. Returns the documents the user must accept now. */
export function checkConsent(): Promise<("agb" | "privacy")[]> {
  if (!isCloudEnabled) return Promise.resolve([]);
  if (!inFlight) inFlight = doCheck().finally(() => (inFlight = null));
  return inFlight;
}

async function doCheck(): Promise<("agb" | "privacy")[]> {
  const res = await authed("/account/consents?locale=de");
  if (!res?.ok) return pending;
  const body = (await res.json()) as {
    accepted: Record<string, number>;
    pending: ("agb" | "privacy")[];
    current: LegalCurrent;
  };
  current = body.current;
  const settings = await db.settings.get("me");
  const local = settings?.consentVersion ?? 0;
  const still: ("agb" | "privacy")[] = [];
  for (const doc of body.pending) {
    const cur = body.current[doc];
    // never accepted server-side: carry the local onboarding consent over when the version matches
    if (cur && body.accepted[doc] === undefined && cur.version <= local) {
      if (await recordConsent(doc, cur.version)) continue;
    }
    still.push(doc);
  }
  set(still);
  return still;
}

export async function acceptPending(): Promise<boolean> {
  let ok = true;
  for (const doc of pending) {
    const cur = current[doc];
    if (!cur) continue;
    ok = (await recordConsent(doc, cur.version)) && ok;
  }
  if (ok) {
    const maxVersion = Math.max(...pending.map((d) => current[d]?.version ?? 0), 0);
    const settings = await db.settings.get("me");
    if (settings && maxVersion > settings.consentVersion)
      await db.settings.update("me", {
        consentVersion: maxVersion,
        consentedAt: new Date().toISOString(),
      });
    set([]);
  }
  return ok;
}
