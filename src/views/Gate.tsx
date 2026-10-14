import { useState, type FormEvent } from "react";
import { Mark } from "../components/Mark";
import { signInWithGoogle } from "../lib/google";
import { saveConnection, supabase } from "../lib/supabase";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="gate" data-tauri-drag-region>
      <div className="gate-card">
        <div className="brand brand-large">
          <Mark size={34} />
          <div>
            <div className="wordmark">Talaria</div>
            <div className="byline">Sea of Grass</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// First launch, when the build didn't include the Supabase project details.
export function Setup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [anonKey, setKey] = useState("");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim().replace(/\/+$/, "");
    if (!/^https:\/\/.+/.test(u)) return setError("The project URL starts with https://");
    if (anonKey.trim().length < 20) return setError("That doesn’t look like an anon key.");
    saveConnection({ url: u, anonKey: anonKey.trim() });
    onDone();
  };
  return (
    <Frame>
      <form onSubmit={submit} className="gate-form">
        <p className="muted">Connect to your Supabase project. Find both values under Project Settings → API.</p>
        <label>Project URL<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoFocus /></label>
        <label>Anon public key<input value={anonKey} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" type="submit">Connect</button>
      </form>
    </Frame>
  );
}

export function Auth() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const auth = supabase().auth;
    const { data, error } =
      mode === "in"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({
            email,
            password,
            // The confirmation link lands on the download page, which says what to do next.
            options: { data: { name: name.trim() }, emailRedirectTo: "https://seaofgrass.studio/talaria/?confirmed=1" },
          });
    setBusy(false);
    if (error)
      return setMsg({
        text: /not confirmed/i.test(error.message)
          ? "Your email isn’t confirmed yet. Click the link in the confirmation email, or ask Tristan to approve your account."
          : /invalid login/i.test(error.message)
            ? "That email and password don’t match."
            : error.message,
      });
    if (mode === "up" && !data.session) {
      setMode("in");
      setMsg({
        ok: true,
        text: "Account created. Check your email for a confirmation link, then come back and sign in here. No email after a few minutes? Ask Tristan to approve your account.",
      });
    }
  };

  const google = async () => {
    setGoogleBusy(true);
    setMsg(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e) });
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <Frame>
      <button type="button" className="google-btn" onClick={google} disabled={googleBusy}>
        <GoogleG />
        {googleBusy ? "Finish signing in in your browser…" : "Continue with Google"}
      </button>
      <div className="gate-or"><span>or use email</span></div>
      <form onSubmit={submit} className="gate-form">
        <div className="gate-tabs">
          <button type="button" className={mode === "in" ? "is-on" : ""} onClick={() => setMode("in")}>Sign in</button>
          <button type="button" className={mode === "up" ? "is-on" : ""} onClick={() => setMode("up")}>Create account</button>
        </div>
        {mode === "up" && (
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
        )}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === "in"} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
        {msg && <p className={msg.ok ? "form-ok" : "form-error"}>{msg.text}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </Frame>
  );
}

// Google's "G", in its own colours as their branding guidelines ask.
function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
