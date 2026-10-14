import { supabase } from "./supabase";

// "Continue with Google".
//
// In the desktop app, Google's sign-in page opens in the system browser (where
// the person is already signed into Google). When they pick an account,
// Supabase redirects to a tiny server the app runs on localhost for a moment;
// the app catches the one-time code, trades it for a session, and comes to the
// front. These ports must be listed under Authentication → URL Configuration
// → Redirect URLs in Supabase.
export const LOOPBACK_PORTS = [17321, 17322, 17323];

export const inApp = "__TAURI_INTERNALS__" in window;

const DONE_PAGE = `<!doctype html><meta charset="utf-8"><title>Talaria</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#faf9f6;color:#141311;
font:14px/1.7 'IBM Plex Mono',Menlo,monospace;text-align:center">
<div><p style="letter-spacing:.14em;text-transform:uppercase;font-weight:500;margin:0">Talaria</p>
<p style="margin:.4rem 0 0;color:rgba(20,19,17,.55)">You’re signed in. You can close this tab.</p></div>
<script>setTimeout(() => window.close(), 1200)</script></body>`;

export async function signInWithGoogle(): Promise<void> {
  const auth = supabase().auth;

  // In a plain browser (development), a normal redirect is enough.
  if (!inApp) {
    const { error } = await auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    return;
  }

  const { start, cancel, onUrl } = await import("@fabianlars/tauri-plugin-oauth");
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");

  const port = await start({ ports: LOOPBACK_PORTS, response: DONE_PAGE });

  let unlisten: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    unlisten();
    clearTimeout(timer);
    cancel(port).catch(() => {});
  };

  try {
    const redirected = new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Sign-in timed out. Try again.")), 5 * 60_000);
      onUrl(resolve).then((u) => (unlisten = u));
    });

    const { data, error } = await auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `http://localhost:${port}`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) throw error ?? new Error("Couldn’t start Google sign-in.");
    await openUrl(data.url);

    const url = new URL(await redirected);
    const code = url.searchParams.get("code");
    if (!code) {
      const why = url.searchParams.get("error_description") ?? url.hash.match(/error_description=([^&]+)/)?.[1];
      throw new Error(why ? decodeURIComponent(why.replace(/\+/g, " ")) : "Google sign-in was cancelled.");
    }
    const exchanged = await auth.exchangeCodeForSession(code);
    if (exchanged.error) throw exchanged.error;

    const win = getCurrentWindow();
    await win.unminimize().catch(() => {});
    await win.setFocus().catch(() => {});
  } finally {
    cleanup();
  }
}
