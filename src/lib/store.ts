import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { ID, Rows, Table } from "./types";

// One small store for the whole app. Every row the two of us can see is held
// in memory (it is a two-person workspace, so this stays small); changes are
// applied locally first, then sent to Supabase, and Supabase's realtime feed
// brings in the other person's changes.

type Maps = { [T in Table]: Record<ID, Rows[T]> };

export interface State extends Maps {
  me: ID | null;
  loaded: boolean;
  error: string | null;
}

const empty = (): Maps => ({ spaces: {}, profiles: {}, projects: {}, sections: {}, tasks: {}, comments: {} });

let state: State = { ...empty(), me: null, loaded: false, error: null };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function putRow<T extends Table>(table: T, row: Rows[T]) {
  set({ [table]: { ...state[table], [row.id]: row } } as Partial<State>);
}

function dropRow(table: Table, id: ID) {
  if (!(id in state[table])) return;
  const next = { ...state[table] };
  delete next[id];
  set({ [table]: next } as Partial<State>);
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const getState = () => state;

export function reportError(e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  console.error(e);
  set({ error: msg });
}

export const clearError = () => set({ error: null });

// ---------------------------------------------------------------------------
// Loading and live sync
// ---------------------------------------------------------------------------

const byId = <R extends { id: ID }>(rows: R[] | null) =>
  Object.fromEntries((rows ?? []).map((r) => [r.id, r])) as Record<ID, R>;

export async function loadAll() {
  const db = supabase();
  const [spaces, profiles, projects, sections, tasks] = await Promise.all([
    db.from("spaces").select("*"),
    db.from("profiles").select("*"),
    db.from("projects").select("*"),
    db.from("sections").select("*"),
    db.from("tasks").select("*"),
  ]);
  const err = spaces.error || profiles.error || projects.error || sections.error || tasks.error;
  if (err) throw err;
  set({
    spaces: byId(spaces.data),
    profiles: byId(profiles.data),
    projects: byId(projects.data),
    sections: byId(sections.data),
    tasks: byId(tasks.data),
    loaded: true,
  });
}

export async function loadComments(taskId: ID) {
  const { data, error } = await supabase().from("comments").select("*").eq("task_id", taskId);
  if (error) return reportError(error);
  set({ comments: { ...state.comments, ...byId(data) } });
}

let channel: RealtimeChannel | null = null;

export function startSync(me: ID) {
  set({ me });
  stopSync();
  const db = supabase();
  channel = db
    .channel("workspace")
    .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
      const table = payload.table as Table;
      if (!(table in state)) return;
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: ID }).id;
        if (id) dropRow(table, id);
      } else {
        putRow(table, payload.new as Rows[typeof table]);
      }
    })
    .subscribe((status) => {
      // Re-read everything after (re)connecting so nothing missed while
      // offline or asleep is lost.
      if (status === "SUBSCRIBED") loadAll().catch(reportError);
    });
}

export function stopSync() {
  if (channel) supabase().removeChannel(channel);
  channel = null;
}

export function resetStore() {
  stopSync();
  set({ ...empty(), me: null, loaded: false, error: null });
}

// ---------------------------------------------------------------------------
// Mutations — optimistic, rolled back if the server refuses.
// Writes are sent one at a time, in order, so a new project always reaches
// the server before its sections, and two quick edits never arrive swapped.
// ---------------------------------------------------------------------------

type Result = PromiseLike<{ error: unknown }>;
let queue: Promise<unknown> = Promise.resolve();

function send(write: () => Result, onError: () => void) {
  queue = queue.then(async () => {
    const { error } = await write();
    if (error) {
      onError();
      reportError(error);
    }
  });
}

export function insert<T extends Table>(table: T, row: Partial<Rows[T]>): Rows[T] {
  const full = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...row,
  } as unknown as Rows[T];
  if (table === "tasks") (full as Rows["tasks"]).updated_at ??= full.created_at;
  putRow(table, full);
  send(() => supabase().from(table).insert(full), () => dropRow(table, full.id));
  return full;
}

export function update<T extends Table>(table: T, id: ID, patch: Partial<Rows[T]>) {
  const before = state[table][id] as Rows[T] | undefined;
  if (!before) return;
  putRow(table, { ...before, ...patch });
  send(() => supabase().from(table).update(patch as never).eq("id", id), () => putRow(table, before));
}

export function remove(table: Exclude<Table, "spaces">, id: ID) {
  const snapshot = { ...state };
  // Mirror the database's cascades locally so the UI updates at once.
  if (table === "projects") {
    Object.values(state.sections).forEach((s) => s.project_id === id && dropRow("sections", s.id));
    Object.values(state.tasks).forEach((t) => t.project_id === id && dropRow("tasks", t.id));
  }
  if (table === "tasks") {
    const doomed = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of Object.values(state.tasks)) {
        if (t.parent_id && doomed.has(t.parent_id) && !doomed.has(t.id)) {
          doomed.add(t.id);
          grew = true;
        }
      }
    }
    doomed.forEach((d) => dropRow("tasks", d));
  }
  if (table === "sections") {
    Object.values(state.tasks).forEach(
      (t) => t.section_id === id && putRow("tasks", { ...t, section_id: null }),
    );
  }
  dropRow(table, id);
  send(() => supabase().from(table).delete().eq("id", id), () => set(snapshot));
}

// A position strictly between two neighbours (either may be missing).
export function between(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return 1024;
  if (before === undefined) return after! - 1024;
  if (after === undefined) return before + 1024;
  return (before + after) / 2;
}
