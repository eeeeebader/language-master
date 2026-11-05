import i18next, { type i18n } from "i18next";
import de from "../locales/de.json";
import en from "../locales/en.json";

export type Locale = "de" | "en";
export type Key = keyof typeof de;

export const resources = {
  de: { translation: de },
  en: { translation: en },
} as const;

/**
 * Creates an i18next instance with `{name}` interpolation (ICU-style single braces) and German
 * as the fallback. Missing keys fall back to German; the CI check in scripts/check-keys.mjs
 * fails when a published locale lacks keys.
 */
export function createI18n(locale: Locale = "de"): i18n {
  const inst = i18next.createInstance();
  inst.init({
    lng: locale,
    fallbackLng: "de",
    resources,
    interpolation: { prefix: "{", suffix: "}", escapeValue: false },
    returnNull: false,
  });
  return inst;
}

/** Typed helper bound to an instance. */
export function translator(inst: i18n) {
  return (key: Key, vars?: Record<string, string | number>) => inst.t(key, vars) as string;
}
