#!/usr/bin/env node
/**
 * Generate the secrets the self-hosted Supabase stack needs:
 * JWT_SECRET, ANON_KEY and SERVICE_ROLE_KEY (HS256 JWTs valid 10 years),
 * plus Postgres / dashboard / pooler secrets. Prints an .env fragment.
 * Node >= 18, no dependencies.
 */
import { createHmac, randomBytes } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sign = (payload, secret) => {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
};

const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 24 * 3600;
const jwtSecret = randomBytes(40).toString("base64url");
const anon = sign({ role: "anon", iss: "supabase", iat: now, exp }, jwtSecret);
const service = sign({ role: "service_role", iss: "supabase", iat: now, exp }, jwtSecret);

const out = `# generated ${new Date().toISOString()} by infra/scripts/gen-keys.mjs
POSTGRES_PASSWORD=${randomBytes(24).toString("base64url")}
JWT_SECRET=${jwtSecret}
ANON_KEY=${anon}
SERVICE_ROLE_KEY=${service}
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=${randomBytes(18).toString("base64url")}
SECRET_KEY_BASE=${randomBytes(48).toString("hex")}
VAULT_ENC_KEY=${randomBytes(16).toString("hex")}
PG_META_CRYPTO_KEY=${randomBytes(16).toString("hex")}
POOLER_TENANT_ID=language-master
LOGFLARE_PUBLIC_ACCESS_TOKEN=${randomBytes(24).toString("hex")}
LOGFLARE_PRIVATE_ACCESS_TOKEN=${randomBytes(24).toString("hex")}
S3_PROTOCOL_ACCESS_KEY_ID=${randomBytes(16).toString("hex")}
S3_PROTOCOL_ACCESS_KEY_SECRET=${randomBytes(32).toString("hex")}
`;
process.stdout.write(out);
