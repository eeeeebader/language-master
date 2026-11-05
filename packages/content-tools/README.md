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
