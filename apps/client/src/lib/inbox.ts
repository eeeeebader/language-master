import { db, type InboxRow } from "@/db/db";
import { API_URL, getAccessToken, isCloudEnabled } from "./auth";

const CURSOR = "lm.inbox.since";

/** Fetch new inbox items from the API (on sync); local-only mode has an empty inbox. */
export async function refreshInbox(): Promise<number> {
  if (!isCloudEnabled) return 0;
  const token = await getAccessToken();
  if (!token) return 0;
  const since = localStorage.getItem(CURSOR) ?? "";
  try {
    const res = await fetch(`${API_URL}/inbox?locale=de&since=${encodeURIComponent(since)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { items: Omit<InboxRow, "read">[]; fetchedAt: string };
    let added = 0;
    for (const it of body.items) {
      if (await db.inbox.get(it.id)) continue;
      await db.inbox.put({ ...it, read: false });
      added++;
    }
    localStorage.setItem(CURSOR, body.fetchedAt);
    return added;
  } catch {
    return 0;
  }
}

export async function markRead(id: string) {
  await db.inbox.update(id, { read: true });
}

export async function markAllRead() {
  await db.inbox
    .where("read")
    .equals(0)
    .modify({ read: true })
    .catch(async () => {
      const rows = await db.inbox.filter((r) => !r.read).toArray();
      for (const r of rows) await db.inbox.update(r.id, { read: true });
    });
}
