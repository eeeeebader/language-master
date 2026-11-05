import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** null = mock mode (no Supabase configured). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const MOCK_MODE = supabase === null;
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
