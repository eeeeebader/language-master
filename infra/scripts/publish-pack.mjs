#!/usr/bin/env node
/**
 * Upload a dictionary pack to the Supabase Storage bucket "packs" and register it in
 * dictionary_packs (unpublished; publish from the admin or with --publish).
 *
 *   node infra/scripts/publish-pack.mjs --file packages/content-tools/dist/es-de.v1.sqlite \
 *     --manifest packages/content-tools/dist/es-de.v1.manifest.json [--publish]
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (and optionally PUBLIC_SUPABASE_URL for the url
 * stored in the manifest when the app reaches Supabase under another host).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const file = arg("file");
const manifestPath = arg("manifest");
const publish = process.argv.includes("--publish");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !manifestPath || !url || !key) {
  console.error(
    "usage: --file <pack.sqlite> --manifest <manifest.json>; env SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const headers = { apikey: key, authorization: `Bearer ${key}` };

// 1. bucket (public, read-only for anon)
let r = await fetch(`${url}/storage/v1/bucket`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ id: "packs", name: "packs", public: true }),
});
if (!r.ok && r.status !== 409) {
  const t = await r.text();
  if (!/already exists/i.test(t)) throw new Error(`bucket: ${r.status} ${t}`);
}

// 2. upload (upsert)
const name = basename(file);
r = await fetch(`${url}/storage/v1/object/packs/${name}`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/octet-stream", "x-upsert": "true" },
  body: readFileSync(file),
});
if (!r.ok) throw new Error(`upload: ${r.status} ${await r.text()}`);
const publicUrl = `${process.env.PUBLIC_SUPABASE_URL ?? url}/storage/v1/object/public/packs/${name}`;

// 3. register
const row = {
  id: `${manifest.target}-${manifest.native}-v${manifest.version}${manifest.with_audio ? `-audio-${manifest.audio_tier ?? "core"}` : ""}`,
  target: manifest.target,
  native: manifest.native,
  version: manifest.version,
  url: publicUrl,
  bytes: manifest.bytes,
  sha256: manifest.sha256,
  with_audio: manifest.with_audio,
  audio_tier: manifest.with_audio ? (manifest.audio_tier ?? "core") : null,
  published_at: publish ? new Date().toISOString() : null,
};
r = await fetch(`${url}/rest/v1/dictionary_packs?on_conflict=id`, {
  method: "POST",
  headers: {
    ...headers,
    "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(row),
});
if (!r.ok) throw new Error(`register: ${r.status} ${await r.text()}`);
console.log(`uploaded ${name} → ${publicUrl}${publish ? " (published)" : " (unpublished)"}`);
