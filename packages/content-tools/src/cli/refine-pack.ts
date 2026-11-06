/**
 * Refine an existing dictionary pack with curated glosses, without the Wiktionary sources:
 * the app's seed dictionary and the lecture vocab translations are applied on top of the pack's
 * senses (curated glosses first, Wiktionary glosses kept after them), the search index is
 * updated, and a new version is written with its manifest.
 *
 *   pnpm refine-pack --pack dist/es-de.v3.sqlite --out dist --version 4 \
 *     --seed ../../apps/client/src/data/dictionary-es.ts \
 *     --lectures ../../apps/client/src/data/lectures-es.ts [--overrides overrides.json]
 *
 * overrides.json: { "<lemma>": { "glosses": ["…"], "pos"?: "noun", "gender"?: "f", "article"?: "la" } }
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DictionaryEntry, Lecture } from "@lm/schema";
import { normalise } from "../pack";
import { openNodeSqlite } from "../sqlite";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

interface Override {
  glosses: { text: string; note?: string }[];
  pos?: string;
  gender?: string;
  article?: string;
  examples?: { text: string; translation: string }[];
}

/** "der Hund" → "Hund"; "morgen; der Morgen" → ["morgen", "Morgen"]. */
function glossesFromTranslation(t: string): { text: string }[] {
  return t
    .split(/\s*;\s*/)
    .map((g) => g.replace(/^(der|die|das|ein|eine)\s+/i, "").trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

async function main() {
  const packPath = arg("pack");
  const out = arg("out", "dist") as string;
  const version = Number(arg("version"));
  if (!packPath || !version) throw new Error("--pack and --version are required");

  const overrides = new Map<string, Override>();
  const seedPath = arg("seed");
  if (seedPath) {
    const mod = (await import(pathToFileURL(resolve(seedPath)).href)) as {
      DICTIONARY_ES: DictionaryEntry[];
    };
    for (const e of mod.DICTIONARY_ES)
      overrides.set(normalise(e.lemma), {
        glosses: e.glosses,
        pos: e.pos,
        gender: e.gender,
        article: e.article,
        examples: e.examples,
      });
  }
  const lecturesPath = arg("lectures");
  if (lecturesPath) {
    const mod = (await import(pathToFileURL(resolve(lecturesPath)).href)) as {
      LECTURES_ES: Lecture[];
    };
    for (const l of mod.LECTURES_ES)
      for (const b of l.blocks)
        if (b.type === "vocab_bundle")
          for (const x of b.lemmas)
            if (typeof x !== "string" && !overrides.has(normalise(x.lemma)))
              overrides.set(normalise(x.lemma), {
                glosses: glossesFromTranslation(x.translation.de ?? ""),
              });
  }
  const overridesPath = arg("overrides");
  if (overridesPath) {
    const raw = JSON.parse(readFileSync(overridesPath, "utf8")) as Record<
      string,
      { glosses: string[]; pos?: string; gender?: string; article?: string }
    >;
    for (const [lemma, o] of Object.entries(raw))
      overrides.set(normalise(lemma), { ...o, glosses: o.glosses.map((text) => ({ text })) });
  }
  console.log(`${overrides.size} curated lemmas`);

  mkdirSync(out, { recursive: true });
  const file = join(out, `es-de.v${version}.sqlite`);
  if (existsSync(file)) throw new Error(`${file} exists`);
  copyFileSync(packPath, file);
  const db = await openNodeSqlite(file);
  db.exec("BEGIN");
  let applied = 0;
  for (const [norm, o] of overrides) {
    const rows = db.all<{ id: string; pos: string }>(
      "SELECT id, pos FROM lemma WHERE norm = ? ORDER BY frequency_rank",
      [norm],
    );
    if (rows.length === 0) continue;
    // Several homographs: prefer the one whose part of speech the curation names.
    const row = rows.find((r) => r.pos === o.pos) ?? rows[0];
    if (!row) continue;
    const old = db.all<{ gloss: string; note: string | null }>(
      "SELECT gloss, note FROM sense WHERE lemma_id = ? ORDER BY position",
      [row.id],
    );
    const seen = new Set<string>();
    const merged: { text: string; note?: string }[] = [];
    for (const g of [
      ...o.glosses,
      ...old.map((x) => ({ text: x.gloss, note: x.note ?? undefined })),
    ]) {
      const k = g.text.toLowerCase();
      if (!g.text || seen.has(k) || merged.length >= 4) continue;
      seen.add(k);
      merged.push(g);
    }
    db.run("DELETE FROM sense WHERE lemma_id = ?", [row.id]);
    for (const [i, g] of merged.entries())
      db.run("INSERT INTO sense VALUES (?,?,?,?)", [row.id, i, g.text, g.note ?? null]);
    db.run("DELETE FROM search WHERE lemma_id = ? AND kind = 2", [row.id]);
    const words = new Set<string>();
    for (const g of merged) for (const w of g.text.split(/[,;/]/)) words.add(normalise(w));
    for (const w of words)
      if (w) db.run("INSERT INTO search(lemma_id, norm, kind) VALUES (?, ?, 2)", [row.id, w]);
    const set: string[] = [];
    const params: unknown[] = [];
    if (o.pos && row.pos !== o.pos) {
      set.push("pos = ?");
      params.push(o.pos);
    }
    if (o.gender) {
      set.push("gender = ?");
      params.push(o.gender);
    }
    if (o.article) {
      set.push("article = ?");
      params.push(o.article);
    }
    if (set.length) db.run(`UPDATE lemma SET ${set.join(", ")} WHERE id = ?`, [...params, row.id]);
    if (o.examples?.length) {
      const have = db.all<{ n: number }>("SELECT count(*) AS n FROM example WHERE lemma_id = ?", [
        row.id,
      ])[0];
      if (!have?.n)
        for (const [i, ex] of o.examples.slice(0, 3).entries())
          db.run("INSERT INTO example VALUES (?,?,?,?)", [row.id, i, ex.text, ex.translation]);
    }
    applied++;
  }
  db.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('version', ?)", [String(version)]);
  db.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('refined_at', ?)", [
    new Date().toISOString(),
  ]);
  db.exec("COMMIT");
  db.exec("VACUUM");
  db.close();

  const bytes = statSync(file).size;
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(
    join(out, `es-de.v${version}.manifest.json`),
    `${JSON.stringify({ target: "es", native: "de", version, url: "", bytes, sha256, with_audio: false, published_at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`wrote ${file}: ${applied} lemmas refined, ${bytes} bytes, sha256 ${sha256}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
