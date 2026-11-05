import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const native = Capacitor.isNativePlatform();
/** Custom scheme the magic link opens in the native app (declared in the Android manifest and Info.plist). */
export const NATIVE_REDIRECT = "app.languagemaster.client://auth/callback";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

/** null in local-only mode (no Supabase env). The app keeps working fully offline without it. */
export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: !native,
          flowType: native ? "pkce" : "implicit",
        },
      })
    : null;

export const isCloudEnabled = supabase !== null && API_URL !== "";

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getAccessToken(): Promise<string | null> {
  return (await getSession())?.access_token ?? null;
}

/** Magic link sign-in. Google/Apple OAuth are added with signInWithOAuth once the providers are configured. */
export async function signInWithEmail(email: string, username?: string) {
  if (!supabase) throw new Error("local-only mode");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: native ? NATIVE_REDIRECT : window.location.origin,
      data: username ? { username } : undefined,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s));
  return () => data.subscription.unsubscribe();
}

/** Native: the magic link opens the app with ?code=…; exchange it for a session (PKCE). */
export function listenForNativeAuth(): () => void {
  if (!native || !supabase) return () => undefined;
  const sub = App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(NATIVE_REDIRECT)) return;
    const code = new URL(url).searchParams.get("code");
    if (code) await supabase.auth.exchangeCodeForSession(code);
  });
  return () => {
    sub.then((h) => h.remove());
  };
}
