// Talaria MCP server — lets Claude read and update Talaria tasks as you.
//
// It signs in with Google the same way the app does (browser + one-time code
// caught on localhost), keeps its own session on this computer, and talks to
// Supabase directly, so every request runs under the same access rules as the
// app: Claude only ever sees the spaces you belong to. There is deliberately
// no way to delete anything from here.
//
// stdout is the MCP channel — log with console.error only.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { z } from "zod";

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;
declare const __VERSION__: string;

const SUPABASE_URL = process.env.TALARIA_SUPABASE_URL || __SUPABASE_URL__;
const SUPABASE_KEY = process.env.TALARIA_SUPABASE_KEY || __SUPABASE_KEY__;
// Must be listed under Supabase → Authentication → URL Configuration.
const LOOPBACK_PORTS = [17324, 17325, 17326];

// ---------------------------------------------------------------------------
// Session storage: a small JSON file only this user can read.
// ---------------------------------------------------------------------------

const configDir =
  process.env.TALARIA_HOME ||
  (process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "Talaria")
    : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "talaria"));
const sessionFile = join(configDir, "mcp-session.json");

async function readStore(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(sessionFile, "utf8"));
  } catch {
    return {};
  }
}

async function writeStore(data: Record<string, string>) {
  await mkdir(configDir, { recursive: true });
  await writeFile(sessionFile, JSON.stringify(data), { mode: 0o600 });
  await chmod(sessionFile, 0o600).catch(() => {});
}

const fileStorage = {
  getItem: async (k: string) => (await readStore())[k] ?? null,
  setItem: async (k: string, v: string) => writeStore({ ...(await readStore()), [k]: v }),
  removeItem: async (k: string) => {
    const s = await readStore();
    delete s[k];
    await writeStore(s);
  },
};

const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: fileStorage,
    persistSession: true,
    autoRefreshToken: false, // refreshed on demand by getSession()
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

// ---------------------------------------------------------------------------
// Sign-in: a small page on localhost offering Google or email + password.
// The password goes straight from the browser to this process and on to
// Supabase; it never passes through Claude.
// ---------------------------------------------------------------------------

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const page = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Talaria — connect Claude</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf9f6;color:#141311;font:14px/1.6 Menlo,monospace}
  main{width:min(340px,90vw);display:grid;gap:14px}
  h1{margin:0;font-size:13px;font-weight:500;letter-spacing:.14em;text-transform:uppercase}
  p{margin:0;color:rgba(20,19,17,.6);font-size:12px}
  a.google,button{display:block;width:100%;padding:9px;border-radius:6px;font:inherit;font-weight:500;text-align:center;cursor:pointer;text-decoration:none}
  a.google{border:1px solid #d9d6cf;color:#141311;background:#faf9f6}
  button{border:0;background:#141311;color:#faf9f6}
  label{display:grid;gap:4px;font-size:12px;color:rgba(20,19,17,.6)}
  input{font:inherit;padding:7px 8px;border:1px solid #d9d6cf;border-radius:6px;background:#faf9f6;color:#141311}
  .or{display:flex;gap:10px;align-items:center;font-size:11px;color:rgba(20,19,17,.35)}
  .or:before,.or:after{content:"";flex:1;border-top:1px solid #d9d6cf}
  .err{color:#9a4a4a}
</style><main>${body}</main>`;

const signInPage = (nonce: string, error = "", email = "") => page(`
  <h1>Talaria</h1>
  <p>Sign in so Claude can work with your Talaria tasks — as you, seeing only your spaces.</p>
  <a class="google" href="/google">Continue with Google</a>
  <div class="or">or use email</div>
  <form method="post" action="/password" style="display:grid;gap:10px">
    <input type="hidden" name="nonce" value="${nonce}">
    <label>Email<input name="email" type="email" required autofocus value="${esc(email)}"></label>
    <label>Password<input name="password" type="password" required></label>
    ${error ? `<p class="err">${esc(error)}</p>` : ""}
    <button type="submit">Sign in</button>
  </form>`);

const DONE_PAGE = page(`<h1>Talaria</h1><p>Claude is connected. You can close this tab.</p>
  <script>setTimeout(() => window.close(), 1500)</script>`);

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
}

function readBody(req: import("node:http").IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 10_000) req.destroy();
    });
    req.on("end", () => resolve(new URLSearchParams(data)));
    req.on("error", reject);
  });
}

let signingIn: Promise<void> | null = null;

async function signIn(): Promise<void> {
  // One sign-in at a time, however many tools ask at once.
  signingIn ??= (async () => {
    const server = createServer();
    let port = 0;
    for (const p of LOOPBACK_PORTS) {
      const ok = await new Promise<boolean>((res) => {
        server.once("error", () => res(false));
        server.listen(p, "127.0.0.1", () => res(true));
      });
      if (ok) {
        port = p;
        break;
      }
    }
    if (!port) throw new Error(`Couldn't start sign-in: ports ${LOOPBACK_PORTS.join(", ")} are all busy.`);

    // Only a form this page served can sign in (stops other sites posting to it).
    const nonce = crypto.randomUUID();
    const html = (res: import("node:http").ServerResponse, body: string, status = 200) =>
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(body);

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Sign-in timed out after 3 minutes. Ask again to retry.")), 180_000);
        const done = (res: import("node:http").ServerResponse) => {
          html(res, DONE_PAGE);
          clearTimeout(timer);
          resolve();
        };
        server.on("request", async (req, res) => {
          try {
            const url = new URL(req.url ?? "/", `http://localhost:${port}`);
            const code = url.searchParams.get("code");
            const oauthError = url.searchParams.get("error_description");

            if (req.method === "GET" && url.pathname === "/" && code) {
              const { error } = await db.auth.exchangeCodeForSession(code);
              return error ? html(res, signInPage(nonce, error.message)) : done(res);
            }
            if (req.method === "GET" && url.pathname === "/" && oauthError) return html(res, signInPage(nonce, oauthError));
            if (req.method === "GET" && url.pathname === "/") return html(res, signInPage(nonce));
            if (req.method === "GET" && url.pathname === "/google") {
              const { data, error } = await db.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `http://localhost:${port}`, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
              });
              if (error || !data.url) return html(res, signInPage(nonce, error?.message ?? "Couldn't start Google sign-in."));
              return res.writeHead(302, { location: data.url }).end();
            }
            if (req.method === "POST" && url.pathname === "/password") {
              const form = await readBody(req);
              if (form.get("nonce") !== nonce) return html(res, signInPage(nonce, "That form has expired; try again."), 403);
              const email = (form.get("email") ?? "").trim();
              const { error } = await db.auth.signInWithPassword({ email, password: form.get("password") ?? "" });
              if (!error) return done(res);
              const msg = /not confirmed/i.test(error.message)
                ? "Your email isn't confirmed yet. Click the link in the confirmation email, or ask Tristan to approve your account."
                : /invalid/i.test(error.message) ? "That email and password don't match." : error.message;
              return html(res, signInPage(nonce, msg, email));
            }
            res.writeHead(404).end();
          } catch (e) {
            html(res, signInPage(nonce, e instanceof Error ? e.message : String(e)), 500);
          }
        });
        const url = `http://localhost:${port}/`;
        console.error(`[talaria] Opening browser to sign in: ${url}`);
        if (!process.env.TALARIA_NO_BROWSER) openBrowser(url); // set in tests
      });
    } finally {
      server.close();
    }
  })().finally(() => (signingIn = null));
  return signingIn;
}

interface Me {
  id: string;
  email: string;
}

async function me(): Promise<Me> {
  let { data } = await db.auth.getSession();
  if (!data.session) {
    await signIn();
    ({ data } = await db.auth.getSession());
  }
  const user = data.session?.user;
  if (!user) throw new Error("Not signed in to Talaria.");
  return { id: user.id, email: user.email ?? "" };
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

async function q<T = Row[]>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

const norm = (s: string) => s.trim().toLowerCase();

function pick<T extends Row>(rows: T[], query: string, what: string, label: (r: T) => string): T {
  const qn = norm(query);
  const exact = rows.filter((r) => r.id === query || norm(label(r)) === qn || norm(String(r.slug ?? "")) === qn);
  if (exact.length === 1) return exact[0];
  const partial = rows.filter((r) => norm(label(r)).includes(qn));
  if (partial.length === 1) return partial[0];
  const options = (exact.length ? exact : partial.length ? partial : rows).map(label).join(", ");
  throw new Error(
    `${partial.length > 1 || exact.length > 1 ? "More than one" : "No"} ${what} matches "${query}". ` +
      (options ? `Options: ${options}.` : `There are no ${what}s yet.`),
  );
}

async function spaces() {
  return q(db.from("spaces").select("id,name,slug,position").order("position"));
}

async function space(name?: string) {
  const all = await spaces();
  if (!all.length) throw new Error("You aren't a member of any Talaria space.");
  return name ? pick(all, name, "space", (s) => s.name) : all[0];
}

async function project(name: string, spaceName?: string) {
  let rows = await q(db.from("projects").select("id,name,space_id,color,archived").eq("archived", false));
  if (spaceName) {
    const sp = await space(spaceName);
    rows = rows.filter((r) => r.space_id === sp.id);
  }
  return pick(rows, name, "project", (p) => p.name);
}

async function sectionsOf(projectId: string) {
  return q(db.from("sections").select("id,name,position").eq("project_id", projectId).order("position"));
}

async function person(who: string, self: Me) {
  if (["me", "myself", "i"].includes(norm(who))) return self.id;
  const rows = await q(db.from("profiles").select("id,name,email"));
  return pick(rows, who, "person", (p) => `${p.name} <${p.email}>`).id as string;
}

async function nextPosition(filter: (b: any) => any) {
  const rows = await q(filter(db.from("tasks").select("position")).order("position", { ascending: false }).limit(1));
  return (rows[0]?.position ?? 0) + 1024;
}

// Turns task rows into something readable, with names instead of ids.
async function describe(tasks: Row[]) {
  if (!tasks.length) return [];
  const [profiles, projects, sections, spaceRows] = await Promise.all([
    q(db.from("profiles").select("id,name")),
    q(db.from("projects").select("id,name")),
    q(db.from("sections").select("id,name")),
    spaces(),
  ]);
  const name = (rows: Row[], id: string | null) => (id ? rows.find((r) => r.id === id)?.name ?? null : null);
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    done: !!t.completed_at,
    space: name(spaceRows, t.space_id),
    project: name(projects, t.project_id),
    section: name(sections, t.section_id),
    assignee: name(profiles, t.assignee_id),
    due: t.due_on,
    ...(t.parent_id ? { parent_task_id: t.parent_id } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
  }));
}

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
});

function tool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return fail(e);
    }
  };
}

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: "talaria", version: __VERSION__ },
  {
    instructions:
      "Talaria is the shared task manager for Sea of Grass studio and the Caduceus study group. " +
      "Work is split into spaces (e.g. 'Sea of Grass', 'Caduceus'), each holding projects; projects have sections " +
      "(columns such as To do / Doing / Done) holding tasks. Refer to spaces, projects, sections and people by name; " +
      "tasks by the id returned from other tools. Dates are YYYY-MM-DD in the user's local time. " +
      "Tasks can carry files (get_task lists them with download links; attach_file uploads one from this computer). " +
      "The first call may open the user's browser to sign in (Google, or email and password). Nothing can be deleted through these tools.",
  },
);

server.registerTool(
  "whoami",
  {
    title: "Who am I in Talaria",
    description: "Signs in if needed, then returns your Talaria name, email, the spaces you belong to, and today's date.",
    annotations: { readOnlyHint: true },
  },
  tool(async () => {
    const self = await me();
    const [profile] = await q(db.from("profiles").select("name,email").eq("id", self.id));
    return { name: profile?.name, email: self.email, spaces: (await spaces()).map((s) => s.name), today: today() };
  }),
);

server.registerTool(
  "list_projects",
  {
    title: "List projects",
    description: "Lists projects (with their sections and open-task counts), optionally in one space.",
    inputSchema: { space: z.string().optional().describe("Space name, e.g. 'Caduceus'. Omit for all spaces.") },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ space: spaceName }: { space?: string }) => {
    await me();
    const all = await spaces();
    const wanted = spaceName ? [pick(all, spaceName, "space", (s) => s.name)] : all;
    const out = [];
    for (const sp of wanted) {
      const projects = await q(db.from("projects").select("id,name").eq("space_id", sp.id).eq("archived", false).order("position"));
      const open = await q(db.from("tasks").select("project_id").eq("space_id", sp.id).is("completed_at", null).is("parent_id", null));
      for (const p of projects)
        out.push({
          space: sp.name,
          project: p.name,
          sections: (await sectionsOf(p.id)).map((s) => s.name),
          open_tasks: open.filter((t) => t.project_id === p.id).length,
        });
    }
    return out;
  }),
);

server.registerTool(
  "list_tasks",
  {
    title: "List tasks",
    description:
      "Finds tasks. Filter by project, space, assignee ('me', a name or an email), section, or due date. " +
      "Completed tasks are left out unless include_completed is true.",
    inputSchema: {
      project: z.string().optional(),
      space: z.string().optional(),
      section: z.string().optional().describe("Section name within the project, e.g. 'Doing'."),
      assignee: z.string().optional().describe("'me', a person's name or email, or 'none' for unassigned."),
      due_before: isoDate.optional().describe("Only tasks due on or before this date (YYYY-MM-DD)."),
      include_completed: z.boolean().optional(),
      include_subtasks: z.boolean().optional().describe("Also return subtasks (default false)."),
      limit: z.number().int().min(1).max(200).optional(),
    },
    annotations: { readOnlyHint: true },
  },
  tool(async (a: {
    project?: string; space?: string; section?: string; assignee?: string; due_before?: string;
    include_completed?: boolean; include_subtasks?: boolean; limit?: number;
  }) => {
    const self = await me();
    let req = db.from("tasks").select("*");
    if (a.project) {
      const p = await project(a.project, a.space);
      req = req.eq("project_id", p.id);
      if (a.section) req = req.eq("section_id", pick(await sectionsOf(p.id), a.section, "section", (s) => s.name).id);
    } else if (a.space) req = req.eq("space_id", (await space(a.space)).id);
    if (a.assignee) req = norm(a.assignee) === "none" ? req.is("assignee_id", null) : req.eq("assignee_id", await person(a.assignee, self));
    if (a.due_before) req = req.lte("due_on", a.due_before);
    if (!a.include_completed) req = req.is("completed_at", null);
    if (!a.include_subtasks) req = req.is("parent_id", null);
    const rows = await q(req.order("due_on", { ascending: true, nullsFirst: false }).order("position").limit(a.limit ?? 100));
    return describe(rows);
  }),
);

server.registerTool(
  "my_tasks",
  {
    title: "My tasks",
    description: "Your open tasks across all spaces, grouped as overdue, today, next 7 days, later, and no due date.",
    annotations: { readOnlyHint: true },
  },
  tool(async () => {
    const self = await me();
    const rows = await q(db.from("tasks").select("*").eq("assignee_id", self.id).is("completed_at", null).order("due_on", { nullsFirst: false }));
    const t = today();
    const week = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA");
    const tasks = await describe(rows);
    const group = (f: (d: string | null) => boolean) => tasks.filter((x) => f(x.due));
    return {
      today: t,
      overdue: group((d) => !!d && d < t),
      due_today: group((d) => d === t),
      next_7_days: group((d) => !!d && d > t && d <= week),
      later: group((d) => !!d && d > week),
      no_due_date: group((d) => !d),
    };
  }),
);

server.registerTool(
  "get_task",
  {
    title: "Get a task",
    description: "Full details for one task, including its description, subtasks, files (with download links) and comments.",
    inputSchema: { task_id: z.string().describe("The task's id.") },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ task_id }: { task_id: string }) => {
    await me();
    const [task] = await q(db.from("tasks").select("*").eq("id", task_id));
    if (!task) throw new Error(`No task with id ${task_id}.`);
    const [subs, comments, profiles, files] = await Promise.all([
      q(db.from("tasks").select("*").eq("parent_id", task_id).order("position")),
      q(db.from("comments").select("*").eq("task_id", task_id).order("created_at")),
      q(db.from("profiles").select("id,name")),
      q(db.from("attachments").select("*").eq("task_id", task_id).order("created_at")).catch(() => [] as Row[]),
    ]);
    // Links last an hour; ask again for fresh ones.
    const links = files.length
      ? (await db.storage.from("attachments").createSignedUrls(files.map((f) => f.path), 3600)).data ?? []
      : [];
    const [described] = await describe([task]);
    return {
      ...described,
      notes: task.notes || "",
      created_at: task.created_at,
      completed_at: task.completed_at,
      subtasks: await describe(subs),
      files: files.map((f, i) => ({
        name: f.name,
        size_bytes: f.size,
        type: f.mime || null,
        added_by: profiles.find((p) => p.id === f.uploaded_by)?.name ?? null,
        added_at: f.created_at,
        download_url: links[i]?.signedUrl ?? null,
      })),
      comments: comments.map((c) => ({
        author: profiles.find((p) => p.id === c.author_id)?.name ?? "Someone",
        at: c.created_at,
        body: c.body,
      })),
    };
  }),
);

server.registerTool(
  "create_task",
  {
    title: "Create a task",
    description:
      "Creates a task. Give a project (and optionally a section — defaults to the first, e.g. 'To do'), or a space " +
      "for a task with no project. Use parent_task_id to add a subtask.",
    inputSchema: {
      title: z.string().min(1),
      project: z.string().optional(),
      section: z.string().optional(),
      space: z.string().optional().describe("Needed only when there's no project; defaults to the first space."),
      assignee: z.string().optional().describe("'me', a person's name, or email."),
      due_on: isoDate.optional(),
      notes: z.string().optional(),
      parent_task_id: z.string().optional(),
    },
  },
  tool(async (a: {
    title: string; project?: string; section?: string; space?: string; assignee?: string;
    due_on?: string; notes?: string; parent_task_id?: string;
  }) => {
    const self = await me();
    const row: Row = {
      title: a.title.trim(),
      notes: a.notes ?? "",
      due_on: a.due_on ?? null,
      assignee_id: a.assignee ? await person(a.assignee, self) : null,
      created_by: self.id,
      project_id: null,
      section_id: null,
      parent_id: null,
    };
    if (a.parent_task_id) {
      const [parent] = await q(db.from("tasks").select("id,space_id,project_id").eq("id", a.parent_task_id));
      if (!parent) throw new Error(`No task with id ${a.parent_task_id}.`);
      Object.assign(row, { space_id: parent.space_id, project_id: parent.project_id, parent_id: parent.id });
      row.position = await nextPosition((b) => b.eq("parent_id", parent.id));
    } else if (a.project) {
      const p = await project(a.project, a.space);
      const secs = await sectionsOf(p.id);
      const sec = a.section ? pick(secs, a.section, "section", (s) => s.name) : secs[0];
      Object.assign(row, { space_id: p.space_id, project_id: p.id, section_id: sec?.id ?? null });
      row.position = await nextPosition((b) => (sec ? b.eq("section_id", sec.id) : b.eq("project_id", p.id)).is("parent_id", null));
    } else {
      const sp = await space(a.space);
      row.space_id = sp.id;
      row.position = await nextPosition((b) => b.eq("space_id", sp.id).is("project_id", null).is("parent_id", null));
    }
    const [created] = await q(db.from("tasks").insert(row).select("*"));
    return { created: (await describe([created]))[0] };
  }),
);

server.registerTool(
  "update_task",
  {
    title: "Update a task",
    description:
      "Changes a task: rename, edit the description, (re)assign, set or clear the due date, mark complete or not, " +
      "or move it to another section or project. Only the fields you pass change.",
    inputSchema: {
      task_id: z.string(),
      title: z.string().min(1).optional(),
      notes: z.string().optional().describe("Replaces the whole description."),
      assignee: z.string().optional().describe("'me', a name, an email, or 'none' to unassign."),
      due_on: z.union([isoDate, z.literal("none")]).optional().describe("YYYY-MM-DD, or 'none' to clear."),
      completed: z.boolean().optional(),
      project: z.string().optional().describe("Move to this project (lands in its first section unless section is given)."),
      section: z.string().optional().describe("Move to this section of the task's (or the new) project."),
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  tool(async (a: {
    task_id: string; title?: string; notes?: string; assignee?: string; due_on?: string;
    completed?: boolean; project?: string; section?: string;
  }) => {
    const self = await me();
    const [task] = await q(db.from("tasks").select("*").eq("id", a.task_id));
    if (!task) throw new Error(`No task with id ${a.task_id}.`);
    const patch: Row = {};
    if (a.title !== undefined) patch.title = a.title.trim();
    if (a.notes !== undefined) patch.notes = a.notes;
    if (a.assignee !== undefined) patch.assignee_id = norm(a.assignee) === "none" ? null : await person(a.assignee, self);
    if (a.due_on !== undefined) patch.due_on = a.due_on === "none" ? null : a.due_on;
    if (a.completed !== undefined) patch.completed_at = a.completed ? task.completed_at ?? new Date().toISOString() : null;
    if (a.project !== undefined || a.section !== undefined) {
      if (task.parent_id) throw new Error("Subtasks move with their parent task; move the parent instead.");
      const p = a.project ? await project(a.project) : task.project_id ? { id: task.project_id, space_id: task.space_id } : null;
      if (!p) throw new Error("This task has no project; say which project to move it to.");
      if (p.space_id !== task.space_id) throw new Error("Tasks can't move between spaces.");
      const secs = await sectionsOf(p.id);
      const sec = a.section ? pick(secs, a.section, "section", (s) => s.name) : secs[0];
      Object.assign(patch, { project_id: p.id, section_id: sec?.id ?? null });
      patch.position = await nextPosition((b) => (sec ? b.eq("section_id", sec.id) : b.eq("project_id", p.id)).is("parent_id", null));
    }
    if (!Object.keys(patch).length) throw new Error("Nothing to change — pass at least one field.");
    const [updated] = await q(db.from("tasks").update(patch).eq("id", a.task_id).select("*"));
    if (!updated) throw new Error("That task couldn't be updated.");
    return { updated: (await describe([updated]))[0] };
  }),
);

server.registerTool(
  "add_comment",
  {
    title: "Comment on a task",
    description: "Adds a comment to a task, posted as you.",
    inputSchema: { task_id: z.string(), body: z.string().min(1) },
  },
  tool(async ({ task_id, body }: { task_id: string; body: string }) => {
    const self = await me();
    const [task] = await q(db.from("tasks").select("id,space_id,title").eq("id", task_id));
    if (!task) throw new Error(`No task with id ${task_id}.`);
    await q(db.from("comments").insert({ task_id, space_id: task.space_id, author_id: self.id, body: body.trim() }));
    return { commented_on: task.title };
  }),
);

server.registerTool(
  "create_project",
  {
    title: "Create a project",
    description: "Creates a project in a space, with To do / Doing / Done sections.",
    inputSchema: {
      name: z.string().min(1),
      space: z.string().optional().describe("Space name; defaults to the first space (Sea of Grass)."),
    },
  },
  tool(async ({ name, space: spaceName }: { name: string; space?: string }) => {
    const self = await me();
    const sp = await space(spaceName);
    const last = await q(db.from("projects").select("position").eq("space_id", sp.id).order("position", { ascending: false }).limit(1));
    const colors = ["#6b7f5e", "#4d6a86", "#a0643c", "#8a5a7d", "#b08d2f", "#3f7d74", "#9a4a4a", "#141311"];
    const count = (await q(db.from("projects").select("id").eq("space_id", sp.id))).length;
    const [p] = await q(
      db.from("projects")
        .insert({ space_id: sp.id, name: name.trim(), color: colors[count % colors.length], position: (last[0]?.position ?? 0) + 1024, created_by: self.id })
        .select("id,name"),
    );
    await q(db.from("sections").insert(["To do", "Doing", "Done"].map((n, i) => ({ space_id: sp.id, project_id: p.id, name: n, position: (i + 1) * 1024 }))));
    return { created: { space: sp.name, project: p.name, sections: ["To do", "Doing", "Done"] } };
  }),
);

const MAX_FILE_BYTES = 50 * 1024 * 1024; // Supabase free plan, per file
const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".mp4": "video/mp4", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json",
};

server.registerTool(
  "attach_file",
  {
    title: "Attach a file to a task",
    description:
      "Uploads a file from this computer (an image, a .blend, a PDF, audio…) and attaches it to a task, as you. " +
      "Files can be up to 50 MB.",
    inputSchema: {
      task_id: z.string(),
      path: z.string().describe("Absolute path of the file on this computer. ~ is allowed."),
      name: z.string().optional().describe("Name to show in Talaria; defaults to the file's own name."),
    },
  },
  tool(async ({ task_id, path, name }: { task_id: string; path: string; name?: string }) => {
    const self = await me();
    const full = path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
    const info = await stat(full).catch(() => null);
    if (!info?.isFile()) throw new Error(`No file at ${full}.`);
    if (info.size > MAX_FILE_BYTES)
      throw new Error(`That file is ${(info.size / 1048576).toFixed(1)} MB; Talaria files can be up to 50 MB.`);
    const [task] = await q(db.from("tasks").select("id,space_id,title").eq("id", task_id));
    if (!task) throw new Error(`No task with id ${task_id}.`);
    const shown = (name ?? basename(full)).trim();
    const safe = shown.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
    const objectPath = `${task.space_id}/${task.id}/${crypto.randomUUID()}-${safe}`;
    const type = MIME[extname(full).toLowerCase()] ?? "application/octet-stream";
    const { error } = await db.storage.from("attachments").upload(objectPath, await readFile(full), { contentType: type });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    await q(db.from("attachments").insert({
      space_id: task.space_id, task_id: task.id, name: shown, path: objectPath, size: info.size,
      mime: type === "application/octet-stream" ? "" : type, uploaded_by: self.id,
    }));
    return { attached: shown, to_task: task.title, size_bytes: info.size };
  }),
);

server.registerTool(
  "sign_out",
  {
    title: "Sign out of Talaria",
    description: "Forgets this computer's Talaria sign-in for Claude. The next tool call will ask to sign in again.",
    annotations: { idempotentHint: true },
  },
  tool(async () => {
    await db.auth.signOut({ scope: "local" });
    return { signed_out: true };
  }),
);

await server.connect(new StdioServerTransport());
console.error(`[talaria] MCP server ${__VERSION__} ready`);
