import { APP_SETTINGS_DEFAULTS, appSettings, type Db } from "@lm/database";

export type Settings = Record<string, unknown>;

/** app_settings with a 30 s cache; defaults fill any missing key. */
export class SettingsStore {
  private cache: { at: number; value: Settings } | null = null;
  constructor(
    private readonly db: Db,
    private readonly ttlMs = 30_000,
  ) {}

  async all(): Promise<Settings> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.value;
    const rows = await this.db.select().from(appSettings);
    const value: Settings = { ...APP_SETTINGS_DEFAULTS };
    for (const r of rows) value[r.key] = r.valueJson;
    this.cache = { at: Date.now(), value };
    return value;
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    const all = await this.all();
    return (all[key] as T | undefined) ?? fallback;
  }

  invalidate() {
    this.cache = null;
  }
}
