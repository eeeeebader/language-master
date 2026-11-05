import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";

export interface AuthUser {
  id: string;
  email: string | null;
  role: string | null;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/** Verify a Supabase access token (HS256, signed with the project's JWT secret). */
export async function verifySupabaseJwt(token: string, secret: string): Promise<AuthUser> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    audience: "authenticated",
  });
  if (!payload.sub) throw new Error("token has no subject");
  const meta = (payload.app_metadata as Record<string, unknown> | undefined) ?? {};
  return {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    role: typeof meta.role === "string" ? meta.role : null,
  };
}

export function requireUser(secret: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return c.json({ error: "missing bearer token" }, 401);
    try {
      c.set("user", await verifySupabaseJwt(token, secret));
    } catch {
      return c.json({ error: "invalid token" }, 401);
    }
    await next();
  };
}

export function requireRole(roles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const u = c.get("user");
    if (!u?.role || !roles.includes(u.role)) return c.json({ error: "forbidden" }, 403);
    await next();
  };
}
