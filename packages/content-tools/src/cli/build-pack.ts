/**
 * Build a dictionary pack from the two Kaikki Wiktionary extracts.
 *
 *   pnpm build-pack --de kaikki.org-dictionary-Spanisch.jsonl --en kaikki.org-dictionary-Spanish.jsonl \
 *     --overrides overrides.es-de.json --out dist --version 1
 *
 * --de: https://kaikki.org/dewiktionary/Spanisch/kaikki.org-dictionary-Spanisch.jsonl (German glosses)
 * --en: https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl (forms, gender, IPA)
 * Both CC BY-SA 4.0. Output: dist/es-de.v{n}.sqlite plus dist/es-de.v{n}.manifest.json.
 */
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { DictionaryEntry } from "@lm/schema";
import {
  applyOverride,
  type DeWiktionaryLine,
  fromDeWiktionary,
  inflectedForm,
  type KaikkiLine,
  mergeMorphology,
  type Overrides,
} from "../kaikki";
import { packFileName } from "../manifest";
import { buildPack, type ExtraForm } from "../pack";
import { openNodeSqlite } from "../sqlite";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function* readLines<T>(path: string, limit = Number.MAX_SAFE_INTEGER): AsyncGenerator<T> {
  const rl = createInterface({
    input: createReadStream(path, "utf8"),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as T;
    if (++n >= limit) break;
  }
}

const key = (word: string, pos: string) => `${word}\u0000${pos}`;

async function main() {
  const de = arg("de");
  const en = arg("en");
  const out = arg("out", "dist") as string;
  const version = Number(arg("version", "1"));
  const limit = Number(arg("limit", String(Number.MAX_SAFE_INTEGER)));
  if (!de) throw new Error("--de <kaikki.org-dictionary-Spanisch.jsonl> is required");
  const overrides: Overrides = arg("overrides")
    ? (JSON.parse(readFileSync(arg("overrides") as string, "utf8")) as Overrides)
    : {};

  // 1. German glosses
  const entries = new Map<string, DictionaryEntry>();
  const extraForms = new Map<string, ExtraForm[]>();
  for await (const line of readLines<DeWiktionaryLine>(de, limit)) {
    const infl = inflectedForm(line);
    if (infl) {
      const list = extraForms.get(infl.lemma) ?? [];
      list.push({ form: infl.form, kind: infl.kind });
      extraForms.set(infl.lemma, list);
      continue;
    }
    const e = fromDeWiktionary(line);
    if (!e) continue;
    const k = key(line.word, e.pos);
    const prev = entries.get(k);
    if (prev) {
      // several de.wiktionary entries per word (homographs): merge glosses
      const seen = new Set(prev.glosses.map((g) => g.text));
      for (const g of e.glosses)
        if (!seen.has(g.text) && prev.glosses.length < 4) prev.glosses.push(g);
    } else entries.set(k, e);
  }
  console.log(
    `de.wiktionary: ${entries.size} lemmas with German glosses, ${[...extraForms.values()].reduce((a, l) => a + l.length, 0)} inflected forms`,
  );

  // 2. Morphology from the English extract (streamed; 1.1 GB)
  let merged = 0;
  if (en) {
    for await (const line of readLines<KaikkiLine>(en)) {
      if (line.lang_code !== "es") continue;
      const posMapped = fromDeWiktionary({
        ...line,
        senses: [{ glosses: ["x"] }],
      } as DeWiktionaryLine)?.pos;
      if (!posMapped) continue;
      const e = entries.get(key(line.word, posMapped));
      if (!e) continue;
      entries.set(key(line.word, posMapped), mergeMorphology(e, line));
      merged++;
    }
    console.log(`en.wiktionary: morphology merged into ${merged} lemmas`);
  }

  // 3. Overrides: curated glosses win; unknown lemmas are added
  for (const [lemma, ov] of Object.entries(overrides)) {
    const existing = [...entries.values()].find((e) => e.lemma === lemma);
    if (existing) entries.set(key(lemma, existing.pos), applyOverride(existing, ov));
    else if (ov.glosses && ov.pos)
      entries.set(key(lemma, ov.pos), {
        id: `es:${lemma}`,
        language: "es",
        lemma,
        pos: ov.pos,
        glosses: ov.glosses,
        examples: ov.examples ?? [],
        tags: ov.tags ?? [],
        ...ov,
      });
  }

  // One row per lemma: when the same word exists in several POS keep the first (noun < verb ordering of input).
  const byLemma = new Map<string, DictionaryEntry>();
  for (const e of entries.values()) if (!byLemma.has(e.lemma)) byLemma.set(e.lemma, e);

  mkdirSync(out, { recursive: true });
  const file = join(out, packFileName("es", "de", version));
  const db = await openNodeSqlite(file);
  const n = buildPack(db, byLemma.values(), {
    target: "es",
    native: "de",
    version: String(version),
    built_at: new Date().toISOString(),
    licence:
      "CC BY-SA 4.0 (Wiktionary via kaikki.org: de.wiktionary glosses, en.wiktionary morphology)",
  });
  db.exec("VACUUM");
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
