import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./defaults";
export * from "./schema";
export { schema };

export type Db = ReturnType<typeof createDb>["db"];
/** A Drizzle transaction handle; structurally a subset of Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

/** Create a Drizzle client over postgres-js. Call `close()` on shutdown. */
export function createDb(url: string, opts: { max?: number } = {}) {
  const sql = postgres(url, { max: opts.max ?? 10, prepare: false });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}
