/**
 * Minimal SQLite interface. The pack builder binds it to node:sqlite; the app binds it to
 * wa-sqlite (OPFS) on the web and @capacitor-community/sqlite on iOS/Android.
 */
export interface SqliteLike {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
}

export async function openNodeSqlite(path: string): Promise<SqliteLike & { close(): void }> {
  const mod = (await import("node:sqlite")) as { DatabaseSync: new (p: string) => NodeDb };
  const db = new mod.DatabaseSync(path);
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...(params as SqlValue[]));
    },
    all: <T>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...(params as SqlValue[])) as T[],
    close: () => db.close(),
  };
}

type SqlValue = string | number | bigint | null | Uint8Array;
interface NodeDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...p: SqlValue[]): unknown; all(...p: SqlValue[]): unknown[] };
  close(): void;
}
