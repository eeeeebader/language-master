/** Admin-editable defaults. Keys are read by the API on every request; no release needed to change them. */
export const APP_SETTINGS_DEFAULTS: Record<string, unknown> = {
  "stories.free_per_day": 1,
  "stories.max_per_day": 10,
  "stories.free_active_limit": 2,
  "stories.premium_archive_limit": 50,
  "llm.provider": "anthropic", // anthropic | openai | fake (dev only, no cost)
  "llm.model.write": "claude-haiku-5-5",
  "llm.model.notes": "claude-haiku-5-5",
  "llm.model.openai": "gpt-5-mini",
  "llm.prompt_version": 1,
  "llm.max_known_lemmas": 600,
  "pricing.premium_cents": 1299,
  "pricing.tokens_10_cents": 299,
  "pricing.tokens_50_cents": 999,
  "pricing.premium_included_tokens": 25,
  "languages.enabled": [{ target: "es", native: "de" }],
  maintenance: false,
  announcements: [], // [{ id, title, markdown, at }] shown in the in-app inbox
};
