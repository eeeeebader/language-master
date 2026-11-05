import { auditLog, type DbLike } from "@lm/database";
import { ulid } from "../lib/ulid";

/** Every admin write records actor, table, row and before/after snapshots. */
export async function writeAudit(
  db: DbLike,
  actor: string,
  table: string,
  rowId: string,
  before: unknown,
  after: unknown,
) {
  await db.insert(auditLog).values({
    id: ulid(),
    actor,
    table,
    rowId,
    before: before ?? null,
    after: after ?? null,
  });
}
