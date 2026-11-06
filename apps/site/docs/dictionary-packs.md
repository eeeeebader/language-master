# Dictionary and audio packs

## Dictionary pack

One SQLite file per (study, native) pair, built offline by `@lm/content-tools` from Kaikki
Wiktionary extracts (German glosses, English morphology), WikDict translations and a frequency
list, plus curated overrides. Tables: `lemma`, `form`, `sense`, `example`, `audio`, and a plain
indexed `search` table (lemma, forms, gloss words, accent-stripped) so queries run identically
on `node:sqlite`, sql.js in the browser and native SQLite. Spanish–German v4: 46 731 headwords,
21.6 MB.

`refine-pack` lays curated glosses (the app's seed dictionary and the lecture vocab translations)
on top of an existing pack without the sources, so common words show the beginner meaning first.
The client additionally prefers seed glosses at runtime.

Publishing: `infra/scripts/publish-pack.mjs` uploads to the Supabase bucket `packs` and registers
the row; `GET /packs/manifest` serves the newest published dictionary and audio packs. The app
installs on first launch and updates when the checksum changes; the dictionary is queried in a
Web Worker.

## Audio packs

Clips are rendered by Piper (`es_ES-davefx-medium`), encoded as Opus (24 kbps mono) and keyed by
the exact voiced text.

- **Core** (`--tier core`, ~10 400 clips, 37 MB): the 6 000 most frequent headwords with plurals
  and feminine forms, plus every lecture and official-story text (word forms, sentences, whole
  story). Installed for everyone in the background after the dictionary.
- **Full** (`--tier full`, ~63 000 clips, ~150 MB): every headword; opt-in in the settings.
- **On demand**: `GET /packs/tts?text=` renders anything else through Piper; the client caches
  the clip. Generated stories ship their own clips with the story.

Playback order on the device: local clip, server clip, device speech synthesis. The setting
"Automatisch vorlesen" decides whether taps read aloud or only speaker buttons do.
