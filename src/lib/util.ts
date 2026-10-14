import type { ID, Section, Task } from "./types";

export const byPosition = <T extends { position: number; created_at: string }>(a: T, b: T) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

export function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function dueLabel(iso: string | null): string {
  if (!iso) return "";
  if (iso === todayISO()) return "Today";
  if (iso === todayISO(1)) return "Tomorrow";
  if (iso === todayISO(-1)) return "Yesterday";
  const d = parseDay(iso);
  const days = Math.round((d.getTime() - parseDay(todayISO()).getTime()) / 86_400_000);
  if (days > 1 && days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export type DueTone = "overdue" | "soon" | "later" | "none";

export function dueTone(task: Pick<Task, "due_on" | "completed_at">): DueTone {
  if (!task.due_on) return "none";
  if (task.completed_at) return "later";
  const t = todayISO();
  if (task.due_on < t) return "overdue";
  if (task.due_on <= todayISO(1)) return "soon";
  return "later";
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

export function sectionsOf(sections: Record<ID, Section>, projectId: ID) {
  return Object.values(sections)
    .filter((s) => s.project_id === projectId)
    .sort(byPosition);
}

export function topLevelTasks(tasks: Record<ID, Task>, filter: (t: Task) => boolean) {
  return Object.values(tasks)
    .filter((t) => !t.parent_id && filter(t))
    .sort(byPosition);
}

export function subtasksOf(tasks: Record<ID, Task>, parentId: ID) {
  return Object.values(tasks)
    .filter((t) => t.parent_id === parentId)
    .sort(byPosition);
}

export const PROJECT_COLORS = ["#6b7f5e", "#4d6a86", "#a0643c", "#8a5a7d", "#b08d2f", "#3f7d74", "#9a4a4a", "#141311"];
