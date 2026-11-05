# Dictionary packs

One SQLite file per (study, native) pair, built offline by `@lm/content-tools` from Kaikki
Wiktionary extracts plus curated A1/A2 overrides. Tables: `lemma`, `form`, `sense`, `example`,
`audio`, and an FTS5 index with diacritics removed. Versioned as `es-de.v12.sqlite.zst`, served
from Supabase Storage behind a CDN; the app checks a manifest on launch.

The query layer (`dict-client.ts`) is written against a `SqliteLike` interface so it runs on
`node:sqlite`, wa-sqlite (OPFS, web) and @capacitor-community/sqlite (native).
Size target: ≤ 60 MB with headword audio, ≤ 25 MB without.
