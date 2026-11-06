/**
 * Speech rendering for the API: Piper (PIPER_URL) returns WAV; ffmpeg, when installed, turns it
 * into Opus so clips are small enough to ship with a story or cache on a phone.
 */
import { spawn } from "node:child_process";

export const DEFAULT_VOICE = "es_ES-davefx-medium";

let ffmpegAvailable: boolean | null = null;
async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  ffmpegAvailable = await new Promise<boolean>((res) => {
    const p = spawn("ffmpeg", ["-version"]);
    p.on("error", () => res(false));
    p.on("close", (code) => res(code === 0));
  });
  return ffmpegAvailable;
}

function toOpus(wav: Uint8Array): Promise<Uint8Array> {
  return new Promise((res, rej) => {
    const p = spawn("ffmpeg", [
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "1",
      "-c:a",
      "libopus",
      "-b:a",
      "24k",
      "-f",
      "ogg",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    p.stdout.on("data", (c: Buffer) => chunks.push(c));
    p.on("error", rej);
    p.on("close", (code) =>
      code === 0 ? res(new Uint8Array(Buffer.concat(chunks))) : rej(new Error(`ffmpeg ${code}`)),
    );
    p.stdin.end(Buffer.from(wav));
  });
}

export interface Clip {
  key: string;
  mime: string;
  bytes: Uint8Array;
}

/** Render one text; null when Piper is unreachable or refuses it. */
export async function renderSpeech(
  piperUrl: string,
  text: string,
  voice = DEFAULT_VOICE,
): Promise<Clip | null> {
  const key = text.replace(/\s+/g, " ").trim();
  if (!key) return null;
  const res = await fetch(piperUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ text: key, voice }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const wav = new Uint8Array(await res.arrayBuffer());
  if (await hasFfmpeg()) {
    const opus = await toOpus(wav).catch(() => null);
    if (opus) return { key, mime: "audio/ogg", bytes: opus };
  }
  return { key, mime: "audio/wav", bytes: wav };
}

/** Render many texts with bounded concurrency; failures are skipped, never thrown. */
export async function renderMany(
  piperUrl: string,
  texts: string[],
  concurrency = 4,
  voice = DEFAULT_VOICE,
): Promise<Clip[]> {
  const out: Clip[] = [];
  let i = 0;
  const worker = async () => {
    while (i < texts.length) {
      const t = texts[i++] as string;
      const clip = await renderSpeech(piperUrl, t, voice).catch(() => null);
      if (clip) out.push(clip);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}
