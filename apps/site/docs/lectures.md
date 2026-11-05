# Lecture content system

Lectures are JSON documents made of typed blocks (`@lm/schema` `lecture.ts`): heading, prose,
alphabet_grid, number_table, rule_card, pattern_builder, conjugation_mini, dialogue, compare,
constraint_visual, quick_check, vocab_bundle. Every block has `id`, `audio?` and per-locale text.

`@lm/ui` renders them with pure components, so the admin preview and the app are identical.
Authoring: write JSON (or use the admin block editor) → `pnpm validate-lectures` →
`pnpm render-audio` through Piper → publish a version; the app caches the latest published set.
