import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// `?demo` in development swaps in an in-memory backend; main.tsx installs it.
// Production builds never load it.
let demo: SupabaseClient | null = null;
export const installDemo = (c: unknown) => (demo = c as SupabaseClient);
const isDemo = () => demo !== null;

// Connection details come from the build (VITE_* env vars) when present,
// otherwise from the first-launch setup screen, saved on this machine.
const KEY = "talaria:connection";

export interface Connection {
  url: string;
  anonKey: string;
}

export function getConnection(): Connection | null {
  if (isDemo()) return { url: "demo", anonKey: "demo" };
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && anonKey) return { url, anonKey };
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved) as Connection;
  } catch {
    /* fall through */
  }
  return null;
}

export function saveConnection(c: Connection) {
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function clearConnection() {
  localStorage.removeItem(KEY);
}

export const connectionIsBuiltIn = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  if (demo) return demo;
  const c = getConnection();
  if (!c) throw new Error("Supabase is not configured");
  client = createClient(c.url, c.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // PKCE: Google sign-in returns a one-time code the app exchanges itself.
      flowType: "pkce",
      // Only a plain browser (development) receives the code in its own URL.
      detectSessionInUrl: !("__TAURI_INTERNALS__" in window),
    },
  });
  return client;
}
