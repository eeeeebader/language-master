## Audio pack build

Clips are rendered by Piper (`docker/piper`, voice `es_ES-davefx-medium`), converted to 48 kbps mono
MP3 with ffmpeg and packed into one SQLite file keyed by the exact voiced text. The client extracts
the rows into IndexedDB and plays a clip before falling back to the device's speech synthesis.

```bash
docker build -t lm-piper:dev docker/piper && docker run -d -p 127.0.0.1:5005:5000 lm-piper:dev
PIPER_URL=http://localhost:5005 pnpm build-audio-pack --pack dist/es-de.v2.sqlite \
  --lectures ../../apps/client/src/data/lectures-es.ts --out dist --version 2
node ../../infra/scripts/publish-pack.mjs --file dist/es-de.v2.audio.sqlite --manifest dist/es-de.v2.audio.manifest.json --publish
```

The audio pack shares the dictionary pack's version; the manifest endpoint reports `with_audio`
and `audio_url` when both are published.

## Dictionary pack build (two Wiktionary extracts)

The English-Wiktionary Spanish extract has no German translations, so a Spanish→German pack is
built from two Kaikki files:

- glosses: `https://kaikki.org/dewiktionary/Spanisch/kaikki.org-dictionary-Spanisch.jsonl` (German
  Wiktionary, ~9 MB, ~7 000 lemmas, German sense descriptions and short translations)
- morphology: `https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl` (English
  Wiktionary, ~1.1 GB, forms, gender, conjugations, IPA), streamed
- translations: `https://download.wikdict.com/dictionaries/sqlite/2/es-de.sqlite3` (WikDict, ~49 000
  Spanish lemmas with short German translations per part of speech and quality scores; the primary
  gloss source, CC BY-SA 4.0)
- frequency: `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt`
  (subtitle word frequencies, MIT) for ranking; WikDict importance ranks the rest

```bash
pnpm export-seed-overrides --out overrides.es-de.json   # curated A1 glosses from the client seed
pnpm build-pack --de kaikki.org-dictionary-Spanisch.jsonl --en kaikki.org-dictionary-Spanish.jsonl \
  --wikdict es-de.sqlite3 --frequency es_50k.txt --overrides overrides.es-de.json --out dist --version 3
node ../../infra/scripts/publish-pack.mjs --file dist/es-de.v1.sqlite --manifest dist/es-de.v1.manifest.json --publish
```

The search table is a plain indexed table (lemma, forms, gloss words, accent-stripped) rather than
FTS5, so the pack queries identically under node:sqlite, sql.js and native SQLite builds.

# @lm/content-tools

Build and validate content: dictionary packs, lectures, audio.

| Script | What it does |
| --- | --- |
| `pnpm build-pack --input kaikki.jsonl --overrides overrides.json --out dist --version N` | Kaikki Wiktionary extract → `es-de.vN.sqlite` (tables lemma, form, sense, example, audio + FTS5) and a manifest |
| `pnpm validate-lectures --dir <lectures> [--pack x.sqlite \| --lemmas seed.txt]` | Zod-validates lecture JSON, checks `requires`, quick-check answers and vocab-bundle lemmas |
| `PIPER_URL=… pnpm render-audio --dir <lectures> --out dist/audio/es` | Renders every audio text through Piper, writes files + manifest |

Spanish extract: <https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl>
(CC BY-SA 4.0, attribution in-app). `fixtures/overrides.es-de.example.json` shows the hand-curated
override format (A1/A2 glosses, frequency ranks, tags). The pack uses Node's built-in `node:sqlite`
so the builder needs no native dependencies.

`src/dict-client.ts` is the shared query layer: it is written against a tiny `SqliteLike`
interface so the same code runs on `node:sqlite` (builder, tests, API), wa-sqlite over OPFS (web
client) and @capacitor-community/sqlite (iOS/Android). Search is FTS5 prefix (unicode61 with
diacritics removed) + exact form match + edit-distance-1 fallback.
