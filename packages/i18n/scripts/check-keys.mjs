#!/usr/bin/env node
// Fails when a locale is missing keys relative to German (the reference catalog).
// Locales listed in PUBLISHED must be complete; others only report.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "locales");
const PUBLISHED = (process.env.PUBLISHED_LOCALES ?? "de").split(",");
const de = JSON.parse(readFileSync(join(dir, "de.json"), "utf8"));
const ref = Object.keys(de);
let failed = false;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const locale = file.replace(".json", "");
  const cat = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const missing = ref.filter((k) => !(k in cat));
  const extra = Object.keys(cat).filter((k) => !(k in de));
  const pct = Math.round(((ref.length - missing.length) / ref.length) * 100);
  console.log(`${locale}: ${pct} % complete (${missing.length} missing, ${extra.length} extra)`);
  if (PUBLISHED.includes(locale) && (missing.length || extra.length)) {
    failed = true;
    for (const k of missing) console.log(`  missing: ${k}`);
    for (const k of extra) console.log(`  extra:   ${k}`);
  }
}
process.exit(failed ? 1 : 0);
