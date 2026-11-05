/**
 * Development helper: push the bundled lectures through the admin API (drafts + publish), so the
 * admin console edits the same content the app ships. Signs a short-lived admin token with the
 * project's JWT secret from apps/api/.env for the given user; nothing is printed.
 *
 *   pnpm --filter @lm/api seed-lectures -- --email elias@languagemaster.local --publish
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDb, users } from "@lm/database";
import type { Lecture } from "@lm/schema";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";

try {
  process.loadEnvFile(".env");
} catch {
  /* env from the shell */
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const api = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? "8787"}`;
  const secret = process.env.SUPABASE_JWT_SECRET;
  const dbUrl = process.env.DATABASE_URL;
  const email = arg("email");
  const lecturesPath = arg("lectures", "../client/src/data/lectures-es.ts") as string;
  const publish = process.argv.includes("--publish");
  if (!secret || !dbUrl || !email)
    throw new Error("SUPABASE_JWT_SECRET, DATABASE_URL and --email are required");

  const { db, close } = createDb(dbUrl, { max: 1 });
  const user = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0];
  await close();
  if (!user) throw new Error(`no user with email ${email}`);

  const token = await new SignJWT({ app_metadata: { role: "admin" }, email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
  const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };

  const mod = (await import(pathToFileURL(resolve(lecturesPath)).href)) as {
    LECTURES_ES: Lecture[];
  };
  let n = 0;
  for (const lecture of mod.LECTURES_ES) {
    const res = await fetch(`${api}/admin/lectures`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content_json: lecture }),
    });
    if (!res.ok) throw new Error(`${lecture.slug}: ${res.status} ${await res.text()}`);
    if (publish) {
      const p = await fetch(`${api}/admin/lectures/${lecture.id}/publish`, {
        method: "POST",
        headers,
        body: "{}",
      });
      if (!p.ok) throw new Error(`publish ${lecture.slug}: ${p.status}`);
    }
    n++;
  }
  console.log(`${n} lectures ${publish ? "saved and published" : "saved as drafts"} via ${api}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
