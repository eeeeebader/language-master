/**
 * Render clips through Piper and pack them as MP3 (48 kbps mono) into an audio pack.
 *
 *   PIPER_URL=http://localhost:5000 pnpm build-audio-pack --pack dist/es-de.v2.sqlite \
 *     --lectures ../../apps/client/src/data/lectures-es.ts --out dist --version 2 [--limit 50] [--concurrency 4]
 *
 * Needs ffmpeg on PATH. Output: dist/es-de.v2.audio.sqlite + dist/es-de.v2.audio.manifest.json.
 * A native speaker reviews the alphabet and numbers, which Piper gets wrong most often.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Lecture } from "@lm/schema";
import { createAudioPackSchema, insertClip, packAudioTexts } from "../audio-pack";
import { audioTexts } from "../lectures";
import { openNodeSqlite } from "../sqlite";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function toMp3(wav: Buffer): Promise<Buffer> {
  return new Promise((res, rej) => {
    const p = spawn("ffmpeg", [
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "1",
      "-ar",
      "22050",
      "-b:a",
      "48k",
      "-f",
      "mp3",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    p.stdout.on("data", (c) => chunks.push(c));
    p.on("error", rej);
    p.on("close", (code) =>
      code === 0 ? res(Buffer.concat(chunks)) : rej(new Error(`ffmpeg exit ${code}`)),
    );
    p.stdin.end(wav);
  });
}

async function render(base: string, voice: string, text: string): Promise<Buffer> {
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) throw new Error(`piper ${res.status} for "${text}"`);
  return Buffer.from(await res.arrayBuffer());
}

/** WAV duration from the header (PCM 16-bit). */
function wavMs(wav: Buffer): number | undefined {
  if (wav.length < 44) return undefined;
  const rate = wav.readUInt32LE(24);
  const channels = wav.readUInt16LE(22);
  const bits = wav.readUInt16LE(34);
  const bytesPerSec = rate * channels * (bits / 8);
  return bytesPerSec ? Math.round(((wav.length - 44) / bytesPerSec) * 1000) : undefined;
}

async function main() {
  const base = process.env.PIPER_URL ?? "http://localhost:5000";
  const packPath = arg("pack");
  const lecturesPath = arg("lectures");
  const out = arg("out", "dist") as string;
  const version = Number(arg("version", "1"));
  const limit = Number(arg("limit", String(Number.MAX_SAFE_INTEGER)));
  const concurrency = Number(arg("concurrency", "4"));
  const voice = arg("voice", "es_ES-davefx-medium") as string;
  if (!packPath) throw new Error("--pack <es-de.vN.sqlite> is required");

  const texts = new Set<string>();
  const pack = await openNodeSqlite(packPath);
  for (const t of packAudioTexts(pack)) texts.add(t);
  pack.close();
  if (lecturesPath) {
    const mod = (await import(pathToFileURL(resolve(lecturesPath)).href)) as {
      LECTURES_ES: Lecture[];
    };
    for (const l of mod.LECTURES_ES) for (const t of audioTexts(l)) texts.add(t.text);
  }
  const list = [...texts].slice(0, limit);
  console.log(`${list.length} texts to voice with ${voice}`);

  mkdirSync(out, { recursive: true });
  const file = join(out, `es-de.v${version}.audio.sqlite`);
  const db = await openNodeSqlite(file);
  createAudioPackSchema(db, {
    target: "es",
    native: "de",
    version: String(version),
    voice,
    codec: "mp3 48k mono 22050",
    built_at: new Date().toISOString(),
  });
  let done = 0;
  let failed = 0;
  db.exec("BEGIN");
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const text = list[i++] as string;
      try {
        const wav = await render(base, voice, text);
        const mp3 = await toMp3(wav);
        insertClip(db, text, "audio/mpeg", mp3, wavMs(wav));
        done++;
        if (done % 200 === 0) console.log(`${done}/${list.length}`);
      } catch (e) {
        failed++;
        console.error(`skip "${text}": ${String(e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  db.exec("COMMIT");
  db.exec("VACUUM");
  db.close();
  const bytes = statSync(file).size;
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(
    join(out, `es-de.v${version}.audio.manifest.json`),
    `${JSON.stringify({ target: "es", native: "de", version, url: "", bytes, sha256, with_audio: true, published_at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`wrote ${file}: ${done} clips (${failed} failed), ${bytes} bytes, sha256 ${sha256}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
