# @lm/i18n

One catalog per locale in `locales/`, shared by the app, the admin console and the site.
German (`de.json`) is the reference; every key the client uses lives there.

- `createI18n(locale)` returns an i18next instance with `{name}` interpolation and German fallback.
- `pnpm test` runs `scripts/check-keys.mjs`: published locales (`PUBLISHED_LOCALES`, default `de`)
  must contain exactly the German keys, other locales just report completeness.

Adding a native language is translation work, not code: copy `de.json` to `<locale>.json`,
translate, add the locale to `PUBLISHED_LOCALES` in CI, and ship it with its lecture texts,
dictionary pack and legal texts (the admin shows completeness per locale).

`apps/client` still uses its local `src/lib/i18n.ts` catalog; the keys are identical, so moving it
onto this package is a mechanical follow-up.
