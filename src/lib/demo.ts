// Development-only stand-in for Supabase, enabled with ?demo in the URL.
// Keeps everything in memory so the UI can be exercised without a backend.
// Never included in a production build (see supabase.ts).

import type { Rows, Table } from "./types";
import { todayISO } from "./util";

type Row = Record<string, unknown> & { id: string };

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
const day = todayISO;

const ME = "u-tristan";
const BRYCE = "u-bryce";
const SOG = "s-sog";
const CAD = "s-cad";

let n = 0;
const task = (p: Partial<Rows["tasks"]>): Row => ({
  id: "t" + ++n, space_id: SOG, project_id: null, section_id: null, parent_id: null, title: "", notes: "",
  assignee_id: null, due_on: null, completed_at: null, position: n * 1024, created_by: ME,
  created_at: iso(600 - n), updated_at: iso(600 - n), ...p,
});

const db: { [T in Table]: Row[] } = {
  spaces: [
    { id: SOG, slug: "sea-of-grass", name: "Sea of Grass", position: 1, created_at: iso(9999) },
    { id: CAD, slug: "caduceus", name: "Caduceus", position: 2, created_at: iso(9999) },
  ],
  profiles: [
    { id: ME, name: "Tristan", email: "tristan@example.com", color: "#6b7f5e", avatar_url: null, created_at: iso(9999) },
    { id: BRYCE, name: "Bryce", email: "bryce@example.com", color: "#4d6a86", avatar_url: null, created_at: iso(9999) },
  ],
  projects: [
    { id: "p1", space_id: SOG, name: "Studies index", color: "#6b7f5e", position: 1024, archived: false, created_by: ME, created_at: iso(5000) },
    { id: "p2", space_id: SOG, name: "Windrow", color: "#a0643c", position: 2048, archived: false, created_by: BRYCE, created_at: iso(4000) },
    { id: "p3", space_id: CAD, name: "Homeric Hymn to Hermes", color: "#4d6a86", position: 1024, archived: false, created_by: ME, created_at: iso(3000) },
  ],
  sections: [
    { id: "x1", space_id: SOG, project_id: "p1", name: "To do", position: 1024, created_at: iso(5000) },
    { id: "x2", space_id: SOG, project_id: "p1", name: "Doing", position: 2048, created_at: iso(5000) },
    { id: "x3", space_id: SOG, project_id: "p1", name: "Done", position: 3072, created_at: iso(5000) },
    { id: "x4", space_id: SOG, project_id: "p2", name: "To do", position: 1024, created_at: iso(4000) },
    { id: "x5", space_id: SOG, project_id: "p2", name: "Doing", position: 2048, created_at: iso(4000) },
    { id: "x6", space_id: SOG, project_id: "p2", name: "Done", position: 3072, created_at: iso(4000) },
    { id: "x7", space_id: CAD, project_id: "p3", name: "To do", position: 1024, created_at: iso(3000) },
    { id: "x8", space_id: CAD, project_id: "p3", name: "Doing", position: 2048, created_at: iso(3000) },
    { id: "x9", space_id: CAD, project_id: "p3", name: "Done", position: 3072, created_at: iso(3000) },
  ],
  tasks: [
    task({ project_id: "p1", section_id: "x1", title: "Write the Windrow card copy", assignee_id: ME, due_on: day(0) }),
    task({ project_id: "p1", section_id: "x1", title: "Thumbnail for Study 07", assignee_id: BRYCE, due_on: day(3) }),
    task({ project_id: "p1", section_id: "x2", title: "Re-shoot Grasset fallbacks in autumn light", assignee_id: ME, due_on: day(-1), notes: "Golden hour, north field. Same lens as the summer set." }),
    task({ project_id: "p1", section_id: "x3", title: "Ship Study 06", assignee_id: BRYCE, completed_at: iso(60 * 30) }),
    task({ project_id: "p2", section_id: "x4", title: "Sketch the windrow pattern generator", assignee_id: BRYCE, due_on: day(5) }),
    task({ project_id: "p2", section_id: "x4", title: "Collect reference photos", assignee_id: ME, due_on: day(12) }),
    task({ project_id: "p2", section_id: "x5", title: "Prototype the raking interaction", assignee_id: ME }),
    task({ space_id: CAD, project_id: "p3", section_id: "x7", title: "Read lines 1–200 (the cattle theft)", assignee_id: ME, due_on: day(2) }),
    task({ space_id: CAD, project_id: "p3", section_id: "x7", title: "Compare translations: Evelyn-White vs. West", assignee_id: BRYCE, due_on: day(6) }),
    task({ space_id: CAD, project_id: "p3", section_id: "x8", title: "Notes on the lyre’s invention", assignee_id: BRYCE }),
    task({ title: "Renew the domain", assignee_id: ME, due_on: day(9) }),
  ],
  comments: [],
  attachments: [],
};
db.tasks.push(
  task({ project_id: "p1", parent_id: "t1", title: "Draft", assignee_id: ME, completed_at: iso(30) }),
  task({ project_id: "p1", parent_id: "t1", title: "Bryce reads it over", assignee_id: BRYCE }),
);
db.comments.push(
  { id: "c1", space_id: SOG, task_id: "t3", author_id: BRYCE, body: "The ones from last October were great, could we match those?", created_at: iso(240) },
  { id: "c2", space_id: SOG, task_id: "t3", author_id: ME, body: "Yes — same spot, same hour.", created_at: iso(200) },
);

type Res = { data: Row[] | null; error: null };

class Query implements PromiseLike<Res> {
  private filters: [string, unknown][] = [];
  constructor(private table: Table, private op: "select" | "insert" | "update" | "delete", private payload?: Row | Partial<Row>) {}
  select() { return this; }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  private run(): Res {
    const rows = db[this.table];
    const match = (r: Row) => this.filters.every(([c, v]) => r[c] === v);
    switch (this.op) {
      case "select":
        return { data: rows.filter(match).map((r) => ({ ...r })), error: null };
      case "insert":
        rows.push({ ...(this.payload as Row) });
        return { data: null, error: null };
      case "update":
        rows.forEach((r, i) => match(r) && (rows[i] = { ...r, ...this.payload }));
        return { data: null, error: null };
      case "delete":
        db[this.table] = rows.filter((r) => !match(r));
        return { data: null, error: null };
    }
  }
  then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return new Promise<Res>((r) => setTimeout(() => r(this.run()), 40)).then(ok, bad);
  }
}

const session = { user: { id: ME, email: "tristan@example.com" }, access_token: "demo" };

export function demoClient() {
  return {
    from: (table: Table) => ({
      select: () => new Query(table, "select"),
      insert: (row: Row) => new Query(table, "insert", row),
      update: (patch: Partial<Row>) => new Query(table, "update", patch),
      delete: () => new Query(table, "delete"),
    }),
    channel: () => {
      const ch = {
        on: () => ch,
        subscribe: (cb: (s: string) => void) => (setTimeout(() => cb("SUBSCRIBED"), 0), ch),
      };
      return ch;
    },
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ data: { session }, error: null }),
      signUp: async () => ({ data: { session }, error: null }),
    },
  };
}
