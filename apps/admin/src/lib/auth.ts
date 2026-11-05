import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Role = "admin" | "editor" | "analyst";
export interface AdminSession {
  email: string;
  role: Role;
  token: string;
  mfaVerified: boolean;
}

const MOCK: AdminSession = {
  email: "admin@languagemaster.app (mock)",
  role: "admin",
  token: "mock",
  mfaVerified: true,
};

function roleFromJwt(token: string): Role | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as {
      app_metadata?: { role?: string };
      role?: string;
    };
    const r = payload.app_metadata?.role ?? null;
    return r === "admin" || r === "editor" || r === "analyst" ? r : null;
  } catch {
    return null;
  }
}

/** Current admin session; in mock mode a fixed admin. */
export function useAdminSession(): {
  session: AdminSession | null;
  loading: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [session, setSession] = useState<AdminSession | null>(supabase ? null : MOCK);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    const apply = async () => {
      const { data } = await sb.auth.getSession();
      const s = data.session;
      if (!s) {
        setSession(null);
        setLoading(false);
        return;
      }
      const role = roleFromJwt(s.access_token);
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      setSession(
        role
          ? {
              email: s.user.email ?? "",
              role,
              token: s.access_token,
              mfaVerified: aal?.currentLevel === "aal2",
            }
          : null,
      );
      setLoading(false);
    };
    apply();
    const { data: sub } = sb.auth.onAuthStateChange(() => apply());
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    session,
    loading,
    signIn: async (email) => {
      if (!supabase) return;
      await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}

/** Module access by role (plan: admin, editor, analyst). */
export const ACCESS: Record<string, Role[]> = {
  users: ["admin"],
  limits: ["admin"],
  legal: ["admin", "editor"],
  changelog: ["admin", "editor"],
  jobs: ["admin"],
  ops: ["admin", "editor", "analyst"],
  "content/lectures": ["admin", "editor"],
  "content/dictionary": ["admin", "editor"],
  "content/stories": ["admin", "editor"],
  languages: ["admin"],
  finance: ["admin", "analyst"],
  analytics: ["admin", "analyst"],
  flags: ["admin"],
};

export function canAccess(role: Role, module: string): boolean {
  return (ACCESS[module] ?? ["admin"]).includes(role);
}
