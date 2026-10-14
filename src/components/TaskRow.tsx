import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { HTMLAttributes } from "react";
import { toggleComplete } from "../lib/actions";
import { update, useStore } from "../lib/store";
import type { Task } from "../lib/types";
import { subtasksOf } from "../lib/util";
import { AssigneePicker, Check, DuePicker, EditableText, Icon } from "./bits";

interface Props {
  task: Task;
  selected: boolean;
  onOpen: () => void;
  showProject?: boolean;
  handle?: HTMLAttributes<HTMLElement>;
}

export function TaskRow({ task, selected, onOpen, showProject, handle }: Props) {
  const s = useStore();
  const profiles = Object.values(s.profiles);
  const subs = subtasksOf(s.tasks, task.id);
  const files = Object.values(s.attachments).filter((a) => a.task_id === task.id).length;
  const project = task.project_id ? s.projects[task.project_id] : null;
  return (
    <div className={"task-row" + (selected ? " is-selected" : "") + (task.completed_at ? " is-done" : "")}
      onClick={onOpen}>
      <span className={"drag-handle" + (handle ? "" : " is-off")} {...handle} onClick={(e) => e.stopPropagation()}>
        {handle && <Icon name="drag" size={14} />}
      </span>
      <Check done={!!task.completed_at} onToggle={() => toggleComplete(task)} />
      <div className="task-row-title">
        <EditableText value={task.title} placeholder="Write a task name"
          onSave={(title) => update("tasks", task.id, { title })} />
        {files > 0 && (
          <span className="meta" title="Files">
            {files} <Icon name="clip" size={12} />
          </span>
        )}
        {subs.length > 0 && (
          <span className="meta" title="Subtasks">
            {subs.filter((x) => x.completed_at).length}/{subs.length} <Icon name="subtask" size={12} />
          </span>
        )}
        <button type="button" className="ghost open-btn" onClick={(e) => (e.stopPropagation(), onOpen())}>
          Details <Icon name="chevron" size={12} />
        </button>
      </div>
      {showProject && (
        <span className="cell cell-project">
          {project && (
            <span className="project-chip">
              <i style={{ background: project.color }} />
              {project.name}
            </span>
          )}
        </span>
      )}
      <span className="cell cell-assignee">
        <AssigneePicker value={task.assignee_id} profiles={profiles}
          onChange={(assignee_id) => update("tasks", task.id, { assignee_id })} />
      </span>
      <span className="cell cell-due">
        <DuePicker task={task} compact onChange={(due_on) => update("tasks", task.id, { due_on })} />
      </span>
    </div>
  );
}

export function SortableTaskRow(props: Omit<Props, "handle">) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
      <TaskRow {...props} handle={{ ...attributes, ...listeners }} />
    </div>
  );
}
