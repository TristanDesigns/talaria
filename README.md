# Talaria

Task management for **Sea of Grass** — and for **Caduceus**, the Greek-mythology
study group. Named for the winged sandals of Hermes.

A desktop app (macOS + Linux) in the spirit of Asana: projects with **List** and
**Board** views, sections, drag-and-drop, assignees, due dates, subtasks,
comments, and a **My tasks** page grouped by when things are due. Changes sync
live between everyone in a space.

Download: <https://seaofgrass.studio/talaria/>

## How it fits together

```
src/            React + TypeScript UI (Vite)
  lib/store.ts  in-memory store; optimistic writes; Supabase realtime sync
  views/        My tasks, project List/Board, task pane, sign-in
src-tauri/      Tauri 2 shell that turns the UI into a native app
supabase/       schema.sql — tables, access rules, realtime
.github/        release workflow: builds installers on every v* tag
```

Data lives in a Supabase project (Postgres). Work is split into **spaces** —
*Sea of Grass* and *Caduceus* — each with its own member list (by email). People
only ever see the spaces they belong to.

## One-time setup

1. **Create a Supabase project** at <https://supabase.com> (free tier is plenty).
2. **Run the schema.** Open `supabase/schema.sql`, replace the two example
   emails with yours and Bryce's, then paste it into *SQL Editor → New query →
   Run*.
3. **Auth settings** (*Authentication → Sign In / Providers → Email*): either turn
   off *Confirm email*, or leave it on and click the link in the email after
   signing up. Once you've both made accounts you can turn off *Allow new users
   to sign up* — though non-members can't see anything regardless.
4. **Connect the app.** Copy *Project URL* and the *anon public* key from
   *Project Settings → API*. Either paste them into the app on first launch, or
   bake them into builds (below).

### Google sign-in

"Continue with Google" opens Google in the system browser and catches the
redirect on `http://localhost:17321` (or `…17322` / `…17323`). It needs:

- a Google Cloud OAuth client (Web application) whose redirect URI is
  `https://<project>.supabase.co/auth/v1/callback`, with its ID and secret in
  *Supabase → Authentication → Sign In / Providers → Google*;
- those three localhost addresses under *Authentication → URL Configuration →
  Redirect URLs*;
- while the Google app is in *Testing*, each person's Gmail added as a test
  user (*Google Auth Platform → Audience*).

### Adding someone to Caduceus later

```sql
insert into public.space_members (space_id, email)
select id, 'them@example.com' from public.spaces where slug = 'caduceus';
```

They sign in (Google or email) and see only Caduceus. For Google sign-in,
also add them as a Google test user (above).

## Development

```bash
npm install
npm run dev           # UI in a browser at http://localhost:1420
                      # add ?demo for an offline sample workspace
npm run app           # the real desktop window (needs Rust)
npm run app:build     # installers for this machine → src-tauri/target/release/bundle
```

`.env.production` bakes the Supabase connection into builds; a local `.env`
overrides it (see `.env.example`).

## Releasing

The Supabase connection for release builds lives in `.env.production` (the
publishable key is safe to commit). Then:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

GitHub Actions builds `.dmg` (Apple Silicon + Intel), `.AppImage`, `.deb` and
`.rpm`, and publishes them as a release.

### First launch on macOS

The app isn't notarized by Apple (that needs a paid developer account), so the
first time: right-click **Talaria.app → Open → Open**. Or, after copying it to
Applications:

```bash
xattr -dr com.apple.quarantine /Applications/Talaria.app
```

### On Linux

AppImage: `chmod +x Talaria_*.AppImage` and run it. Or install the `.deb` /
`.rpm` with your package manager.
