# @lm/ui

Design tokens, the sound-sprite manifest and pure React lecture components shared by the app,
the admin console and the marketing site.

- `src/tokens.css` is the single source of truth for colours, radii, fonts and motion. Import it
  with `@import "@lm/ui/tokens.css";` before `@import "tailwindcss";` so the `@theme` block feeds
  Tailwind 4.
- `src/lecture/*` are props-in / JSX-out components with no data-layer imports. Audio is injected
  through `onPlay(text)`, so the admin preview and the app render identically.
- `LectureBlockView` renders every block type of `@lm/schema` `lecture.ts`.

`apps/client` still carries its own copy of the tokens and a local block renderer
(`apps/client/src/components/LectureBlocks.tsx`). Rewiring the client to this package is a
follow-up, not part of v0.1.
