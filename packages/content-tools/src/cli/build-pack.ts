/**
 * Build a dictionary pack from a Kaikki Wiktionary extract.
 *
 *   pnpm build-pack --input kaikki.org-dictionary-Spanish.jsonl --overrides overrides.es-de.json \
 *     --out dist --version 12 [--limit 20000]
 *
 * Download: https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl (CC BY-SA 4.0)
 * Output: dist/es-de.v12.sqlite plus dist/es-de.v12.manifest.json (url to be filled on upload).
 */
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fromKaikki, type KaikkiLine, type Overrides } from "../kaikki";
import { packFileName } from "../manifest";
import { buildPack } from "../pack";
import { openNodeSqlite } from "../sqlite";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function* readLines(path: string, limit: number): AsyncGenerator<KaikkiLine> {
  const rl = createInterface({
    input: createReadStream(path, "utf8"),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as KaikkiLine;
    if (++n >= limit) break;
  }
}

async function main() {
  const input = arg("input");
  const out = arg("out", "dist") as string;
  const version = Number(arg("version", "1"));
  const limit = Number(arg("limit", String(Number.MAX_SAFE_INTEGER)));
  if (!input) throw new Error("--input <kaikki.jsonl> is required");
  const overrides: Overrides = arg("overrides")
    ? (JSON.parse(readFileSync(arg("overrides") as string, "utf8")) as Overrides)
    : {};
  mkdirSync(out, { recursive: true });
  const file = join(out, packFileName("es", "de", version));
  const db = await openNodeSqlite(file);
  // buildPack is synchronous; collect first (the Spanish extract fits in memory at ~1 GB RSS).
  const list: NonNullable<ReturnType<typeof fromKaikki>>[] = [];
  for await (const line of readLines(input, limit)) {
    const e = fromKaikki(line, "de", overrides);
    if (e) list.push(e);
  }
  const n = buildPack(db, list, {
    target: "es",
    native: "de",
    version: String(version),
    built_at: new Date().toISOString(),
    licence: "CC BY-SA 4.0 (Wiktionary via kaikki.org)",
  });
  db.close();
  const bytes = statSync(file).size;
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(
    join(out, `es-de.v${version}.manifest.json`),
    `${JSON.stringify({ target: "es", native: "de", version, url: "", bytes, sha256, with_audio: false, published_at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`wrote ${file}: ${n} lemmas, ${bytes} bytes, sha256 ${sha256}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
