/**
 * Turn the client's hand-curated seed dictionary into the overrides file for the pack builder,
 * so curated A1 glosses, examples and frequency ranks win over Wiktionary.
 *
 *   pnpm export-seed-overrides --out overrides.es-de.json
 */
import { writeFileSync } from "node:fs";
import { DICTIONARY_ES } from "../../../../apps/client/src/data/dictionary-es";
import type { Overrides } from "../kaikki";

const i = process.argv.indexOf("--out");
const out = i >= 0 ? (process.argv[i + 1] as string) : "overrides.es-de.json";
const overrides: Overrides = {};
for (const e of DICTIONARY_ES) {
  const { id: _id, language: _l, lemma, ...rest } = e;
  overrides[lemma] = rest;
}
writeFileSync(out, `${JSON.stringify(overrides, null, 2)}\n`);
console.log(`wrote ${out}: ${Object.keys(overrides).length} overrides`);
