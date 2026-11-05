import { ReviewEvent } from "@lm/schema";
import { z } from "zod";

/** Wire shapes. LWW rows carry updatedAt/deletedAt; the later updatedAt wins. */
export const LwwRow = z
  .object({ id: z.string(), updatedAt: z.string(), deletedAt: z.string().nullable().default(null) })
  .passthrough();
export type LwwRow = z.infer<typeof LwwRow>;

export const ListWordRow = z.object({
  listId: z.string(),
  wordId: z.string(),
  position: z.number().int(),
  addedAt: z.string(),
  deletedAt: z.string().nullable().default(null),
});

export const PushBody = z.object({
  events: z.array(ReviewEvent.omit({ synced: true })).default([]),
  words: z.array(LwwRow).default([]),
  variants: z.array(LwwRow).default([]),
  sentences: z.array(LwwRow).default([]),
  lists: z.array(LwwRow).default([]),
  listWords: z.array(ListWordRow).default([]),
  stories: z.array(LwwRow).default([]),
  settings: LwwRow.nullable().default(null),
});
export type PushBody = z.infer<typeof PushBody>;

export interface PushResult {
  acceptedEventIds: string[];
  duplicateEventIds: string[];
  affectedWordIds: string[];
  serverTime: string;
}

/** Split incoming events into new and already-known ones; idempotent on ulid. */
export function partitionEvents<E extends { id: string; wordId: string }>(
  incoming: E[],
  known: ReadonlySet<string>,
) {
  const seen = new Set<string>();
  const fresh: E[] = [];
  const duplicates: string[] = [];
  for (const e of incoming) {
    if (known.has(e.id) || seen.has(e.id)) {
      duplicates.push(e.id);
      continue;
    }
    seen.add(e.id);
    fresh.push(e);
  }
  const affectedWordIds = [...new Set(fresh.map((e) => e.wordId))];
  return { fresh, duplicates, affectedWordIds };
}

/** LWW: keep the incoming row only if it is newer than what the server has. */
export function lwwWins(
  incomingUpdatedAt: string,
  existingUpdatedAt: string | null | undefined,
): boolean {
  if (!existingUpdatedAt) return true;
  return new Date(incomingUpdatedAt).getTime() > new Date(existingUpdatedAt).getTime();
}

/** Parse and clamp the pull cursor. Missing or invalid cursors mean "everything". */
export function parseCursor(since: string | undefined): Date {
  if (!since) return new Date(0);
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return new Date(0);
  return d;
}

/**
 * The next cursor is the newest updatedAt seen in the pulled rows, minus nothing: rows with
 * updatedAt strictly greater are pulled next time. Clients store it per device.
 */
export function nextCursor(rows: { updatedAt: string | Date }[], previous: Date): string {
  let max = previous.getTime();
  for (const r of rows) max = Math.max(max, new Date(r.updatedAt).getTime());
  return new Date(max).toISOString();
}
