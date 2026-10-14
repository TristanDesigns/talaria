import { useMemo, useState } from "react";
import { Icon, QuickAdd } from "../components/bits";
import { TaskRow } from "../components/TaskRow";
import { createTask } from "../lib/actions";
import { useStore } from "../lib/store";
import type { ID, Task } from "../lib/types";
import { byPosition, todayISO } from "../lib/util";

const GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "none", label: "No due date" },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];

function groupOf(t: Task): GroupKey {
  if (!t.due_on) return "none";
  const today = todayISO();
  if (t.due_on < today) return "overdue";
  if (t.due_on === today) return "today";
  if (t.due_on <= todayISO(7)) return "week";
  return "later";
}

export function MyTasks({ spaceId, selectedId, onOpen }: { spaceId: ID; selectedId: ID | null; onOpen: (id: ID) => void }) {
  const s = useStore();
  const [showDone, setShowDone] = useState(false);
  const me = s.me ? s.profiles[s.me] : null;

  const groups = useMemo(() => {
    const out = new Map<GroupKey, Task[]>(GROUPS.map((g) => [g.key, []]));
    Object.values(s.tasks)
      .filter((t) => t.space_id === spaceId && t.assignee_id === s.me && (showDone || !t.completed_at))
      .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || byPosition(a, b))
      .forEach((t) => out.get(groupOf(t))!.push(t));
    return out;
  }, [s.tasks, s.me, spaceId, showDone]);

  const total = [...groups.values()].reduce((n, g) => n + g.length, 0);

  return (
    <div className="view">
      <header className="view-head" data-tauri-drag-region>
        <Icon name="me" size={18} />
        <h1 className="view-title">My tasks</h1>
      </header>
      <div className="view-tabs">
        <span className="muted">{me ? `Assigned to ${me.name}` : ""}</span>
        <span className="spacer" />
        <label className="toggle">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed
        </label>
      </div>
      <div className="list">
        <div className="list-colheads has-project">
          <span>Task name</span>
          <span>Project</span>
          <span>Assignee</span>
          <span>Due</span>
        </div>
        <QuickAdd placeholder="Add a task for yourself…" className="list-add top"
          onAdd={(title) => createTask({ title, space_id: spaceId, assignee_id: s.me })} />
        {GROUPS.map(({ key, label }) => {
          const list = groups.get(key)!;
          if (!list.length) return null;
          return (
            <section key={key} className={"list-section group-" + key}>
              <div className="list-section-head">
                <span className="section-name">{label}</span>
                <span className="count">{list.length}</span>
              </div>
              {list.map((t) => (
                <div key={t.id} className="has-project">
                  <TaskRow task={t} showProject selected={t.id === selectedId} onOpen={() => onOpen(t.id)} />
                </div>
              ))}
            </section>
          );
        })}
        {total === 0 && (
          <div className="empty">
            <p>Nothing assigned to you here.</p>
            <p className="muted">Tasks assigned to you in any project show up on this page, grouped by when they’re due.</p>
          </div>
        )}
      </div>
    </div>
  );
}
