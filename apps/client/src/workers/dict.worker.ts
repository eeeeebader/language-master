/**
 * Dictionary search off the main thread. Receives the pack bytes once, answers search requests
 * with hydrated entries; stale requests are dropped by the caller via the request id.
 */
import { DictClient, type SqliteLike } from "@lm/content-tools";
import initSqlJs, { type Database } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let client: DictClient | null = null;

function wrap(database: Database): SqliteLike {
  return {
    exec: (q) => {
      database.exec(q);
    },
    run: (q, params = []) => {
      database.run(q, params as never[]);
    },
    all: <T>(q: string, params: unknown[] = []) => {
      const stmt = database.prepare(q);
      stmt.bind(params as never[]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    },
  };
}

type Msg =
  | { type: "open"; bytes: ArrayBuffer }
  | { type: "close" }
  | { type: "search"; id: number; q: string; limit: number };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === "open") {
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    client = new DictClient(wrap(new SQL.Database(new Uint8Array(m.bytes))));
    self.postMessage({ type: "ready" });
  } else if (m.type === "close") {
    client = null;
    self.postMessage({ type: "closed" });
  } else if (m.type === "search") {
    try {
      const entries = client ? client.search(m.q, m.limit) : [];
      self.postMessage({ type: "result", id: m.id, entries });
    } catch (err) {
      self.postMessage({ type: "result", id: m.id, entries: [], error: String(err) });
    }
  }
};
