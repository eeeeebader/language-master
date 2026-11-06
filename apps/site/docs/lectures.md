# Lecture content system

Lectures are typed documents (`@lm/schema` `lecture.ts`) made of blocks with per-locale text:
heading, prose (bold, italic, bullets), alphabet_grid, number_table, word_list, rule_card,
pattern_builder (options may carry a translation), conjugation_mini, dialogue, compare (rows may
carry a translation, cells can open the word drawer), constraint_visual, quick_check,
vocab_bundle (dictionary lemmas with curated translations plus phrases outside the dictionary),
and three interactive widgets: calculator, clock, calendar.

Unit 0 for Spanish has 15 lectures on a winding path plus an optional side branch ("Zahlen und
Uhr meistern"). Ana and Luis are the recurring voices. Every Spanish word in a lecture opens the
generic word drawer: pronunciation, dictionary entry with forms and examples, the learner's own
sentences, the lists it is in, and add-to-list. Each lecture ends with a vocab bundle; words an
earlier lecture already offered are left out, and one tap adds the rest to a "Lektionen" list.

Progress: "Verstanden" is always available; the quick check only reports its score. Time spent
counts towards the daily minutes and the streak. The Lektionen tab returns to the lecture that is
open.

Authoring: edit `apps/client/src/data/lectures-es.ts` (array order is path order; `side: true`
hangs a node off its requirement), run the client tests (schema, requires, quick-check indices,
bundle lemmas), rebuild the core audio pack so new texts are voiced, and seed the admin with
`pnpm --filter @lm/api seed-lectures` so editors start from the shipped content. `@lm/ui`
renders the same blocks for the admin preview.
