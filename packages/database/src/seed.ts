import { APP_SETTINGS_DEFAULTS } from "./defaults";
import { createDb } from "./index";
import { appSettings } from "./schema";

export async function seedAppSettings(db: ReturnType<typeof createDb>["db"]) {
  for (const [key, value] of Object.entries(APP_SETTINGS_DEFAULTS)) {
    await db.insert(appSettings).values({ key, valueJson: value }).onConflictDoNothing();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db, close } = createDb(url, { max: 1 });
  await seedAppSettings(db);
  await close();
  console.log("app_settings seeded");
}
