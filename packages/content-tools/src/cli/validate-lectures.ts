/**
 * Validate lecture JSON files against the schema and a dictionary pack (or a seed lemma list).
 *
 *   pnpm validate-lectures --dir content/lectures/es [--pack dist/es-de.v12.sqlite | --lemmas seed.txt]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DictClient } from "../dict-client";
import { validateLectures } from "../lectures";
import { openNodeSqlite } from "../sqlite";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dir = arg("dir");
  if (!dir) throw new Error("--dir is required");
  let hasLemma: (l: string) => boolean = () => true;
  if (arg("pack")) {
    const client = new DictClient(await openNodeSqlite(arg("pack") as string));
    hasLemma = (l) => !!client.getByLemma(l);
  } else if (arg("lemmas")) {
    const set = new Set(
      readFileSync(arg("lemmas") as string, "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    hasLemma = (l) => set.has(l);
  }
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, json: JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown }));
  const issues = validateLectures(docs, hasLemma);
  for (const i of issues) console.error(`${i.file}: ${i.message}`);
  console.log(`${docs.length} lectures, ${issues.length} issues`);
  process.exit(issues.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
