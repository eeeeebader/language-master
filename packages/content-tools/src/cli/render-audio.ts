/**
 * Render every audio text of the given lectures (and optionally pack headwords) through Piper.
 *
 *   PIPER_URL=http://localhost:5000 pnpm render-audio --dir content/lectures/es --out dist/audio/es [--voice es_ES-davefx-medium]
 *
 * Piper's HTTP server (rhasspy/piper, `python -m piper.http_server`) answers POST / with the text
 * body and returns WAV. Files are written as <id>.wav plus manifest.json {id, text, file, sha256}.
 * A native speaker reviews the alphabet and numbers, which Piper gets wrong most often.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Lecture } from "@lm/schema";
import { audioTexts } from "../lectures";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const base = process.env.PIPER_URL ?? "http://localhost:5000";
  const dir = arg("dir");
  const out = arg("out", "dist/audio") as string;
  const voice = arg("voice", "es_ES-davefx-medium") as string;
  if (!dir) throw new Error("--dir is required");
  mkdirSync(out, { recursive: true });
  const manifestPath = join(out, "manifest.json");
  const manifest: Record<string, { text: string; file: string; sha256: string }> = existsSync(
    manifestPath,
  )
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : {};
  const texts = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => audioTexts(Lecture.parse(JSON.parse(readFileSync(join(dir, f), "utf8")))));
  let rendered = 0;
  for (const t of texts) {
    const file = `${t.id}.wav`;
    if (manifest[t.id]?.text === t.text && existsSync(join(out, file))) continue;
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ text: t.text, voice }),
    });
    if (!res.ok) throw new Error(`piper ${res.status} for "${t.text}"`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(out, file), buf);
    manifest[t.id] = { text: t.text, file, sha256: createHash("sha256").update(buf).digest("hex") };
    rendered++;
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${texts.length} texts, ${rendered} rendered, manifest at ${manifestPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
