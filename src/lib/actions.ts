import { between, getState, insert, update } from "./store";
import type { ID, Task } from "./types";
import { byPosition, PROJECT_COLORS, sectionsOf } from "./util";

export function createProject(spaceId: ID, name: string) {
  const s = getState();
  const projects = Object.values(s.projects).filter((p) => p.space_id === spaceId).sort(byPosition);
  const project = insert("projects", {
    space_id: spaceId,
    name,
    color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    position: between(projects.at(-1)?.position),
    created_by: s.me,
    archived: false,
  });
  ["To do", "Doing", "Done"].forEach((n, i) =>
    insert("sections", { space_id: spaceId, project_id: project.id, name: n, position: (i + 1) * 1024 }),
  );
  return project;
}

export function createSection(projectId: ID, name = "Untitled section") {
  const s = getState();
  const last = sectionsOf(s.sections, projectId).at(-1);
  return insert("sections", { space_id: s.projects[projectId].space_id, project_id: projectId, name, position: between(last?.position) });
}

// New tasks go to the bottom of wherever they are added.
export function createTask(fields: Partial<Task> & { title: string; space_id: ID }) {
  const s = getState();
  const siblings = Object.values(s.tasks)
    .filter((t) =>
      fields.parent_id
        ? t.parent_id === fields.parent_id
        : !t.parent_id && t.space_id === fields.space_id && t.project_id === (fields.project_id ?? null) && t.section_id === (fields.section_id ?? null),
    )
    .sort(byPosition);
  return insert("tasks", {
    notes: "",
    project_id: null,
    section_id: null,
    parent_id: null,
    assignee_id: null,
    due_on: null,
    completed_at: null,
    created_by: s.me,
    position: between(siblings.at(-1)?.position),
    ...fields,
  });
}

export function toggleComplete(task: Task) {
  update("tasks", task.id, { completed_at: task.completed_at ? null : new Date().toISOString() });
}
