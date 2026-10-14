import { useEffect, useState } from "react";
import { Attachments } from "../components/Attachments";
import { AssigneePicker, Avatar, Check, DuePicker, EditableText, Icon, QuickAdd } from "../components/bits";
import { uploadFiles } from "../lib/files";
import { createTask, toggleComplete } from "../lib/actions";
import { insert, loadComments, remove, update, useStore } from "../lib/store";
import type { ID } from "../lib/types";
import { byPosition, sectionsOf, subtasksOf, timeAgo } from "../lib/util";

export function TaskPane({ taskId, onOpen, onClose }: { taskId: ID; onOpen: (id: ID) => void; onClose: () => void }) {
  const s = useStore();
  const task = s.tasks[taskId];
  const [comment, setComment] = useState("");
  const [dropping, setDropping] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    loadComments(taskId);
  }, [taskId]);

  if (!task)
    return (
      <aside className="pane">
        <div className="pane-bar">
          <span className="muted">This task was deleted.</span>
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
      </aside>
    );

  const profiles = Object.values(s.profiles);
  const projects = Object.values(s.projects).filter((p) => p.space_id === task.space_id && !p.archived).sort(byPosition);
  const sections = task.project_id ? sectionsOf(s.sections, task.project_id) : [];
  const subs = subtasksOf(s.tasks, task.id);
  const parent = task.parent_id ? s.tasks[task.parent_id] : null;
  const comments = Object.values(s.comments)
    .filter((c) => c.task_id === task.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const creator = task.created_by ? s.profiles[task.created_by] : null;

  const postComment = () => {
    const body = comment.trim();
    if (!body) return;
    insert("comments", { space_id: task.space_id, task_id: task.id, author_id: s.me, body });
    setComment("");
  };

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const attach = (files: File[]) => files.length && uploadFiles(task, files, setUploading);

  return (
    <aside className={"pane" + (dropping ? " is-dropping" : "")} key={task.id}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropping(false)}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(false);
        attach([...e.dataTransfer.files]);
      }}
      onPaste={(e) => {
        // Pasting a screenshot attaches it; pasting text behaves normally.
        const files = [...e.clipboardData.files];
        if (files.length) {
          e.preventDefault();
          attach(files);
        }
      }}>
      {dropping && <div className="drop-hint">Drop to attach to this task</div>}
      <div className="pane-bar">
        <button type="button" className={"complete-btn" + (task.completed_at ? " is-done" : "")} onClick={() => toggleComplete(task)}>
          <Icon name="check" size={14} /> {task.completed_at ? "Completed" : "Mark complete"}
        </button>
        <span className="spacer" />
        <button type="button" className="ghost" title="Delete task" onClick={() => {
          if (subs.length === 0 || confirm(`Delete this task and its ${subs.length} subtask${subs.length > 1 ? "s" : ""}?`)) {
            remove("tasks", task.id);
            parent ? onOpen(parent.id) : onClose();
          }
        }}>
          <Icon name="trash" />
        </button>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close" title="Close (Esc)"><Icon name="close" /></button>
      </div>

      <div className="pane-body">
        {parent && (
          <button type="button" className="ghost crumb" onClick={() => onOpen(parent.id)}>
            <Icon name="subtask" size={12} /> {parent.title || "Untitled task"}
          </button>
        )}
        <EditableText className="pane-title" wrap value={task.title} placeholder="Write a task name"
          autoFocus={task.title === ""} onSave={(title) => update("tasks", task.id, { title })} />

        <dl className="fields">
          <dt>Assignee</dt>
          <dd>
            <AssigneePicker value={task.assignee_id} profiles={profiles} showName
              onChange={(assignee_id) => update("tasks", task.id, { assignee_id })} />
          </dd>
          <dt>Due date</dt>
          <dd><DuePicker task={task} onChange={(due_on) => update("tasks", task.id, { due_on })} /></dd>
          {!parent && (
            <>
              <dt>Project</dt>
              <dd>
                <select value={task.project_id ?? ""} onChange={(e) => {
                  const project_id = e.target.value || null;
                  const first = project_id ? sectionsOf(s.sections, project_id)[0] : undefined;
                  update("tasks", task.id, { project_id, section_id: first?.id ?? null });
                }}>
                  <option value="">No project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {task.project_id && (
                  <select value={task.section_id ?? ""} onChange={(e) => update("tasks", task.id, { section_id: e.target.value || null })}>
                    <option value="">No section</option>
                    {sections.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                  </select>
                )}
              </dd>
            </>
          )}
        </dl>

        <h3 className="pane-label">Description</h3>
        <EditableText className="notes" multiline value={task.notes} placeholder="What is this task about?"
          onSave={(notes) => update("tasks", task.id, { notes })} />

        <h3 className="pane-label">Files</h3>
        <Attachments task={task} pending={uploading} />

        <h3 className="pane-label">Subtasks {subs.length > 0 && <span className="count">{subs.filter((x) => x.completed_at).length}/{subs.length}</span>}</h3>
        <div className="subtasks">
          {subs.map((sub) => (
            <div key={sub.id} className={"subtask" + (sub.completed_at ? " is-done" : "")}>
              <Check done={!!sub.completed_at} onToggle={() => toggleComplete(sub)} size={16} />
              <EditableText value={sub.title} placeholder="Subtask" onSave={(title) => update("tasks", sub.id, { title })} />
              <AssigneePicker value={sub.assignee_id} profiles={profiles} size={18}
                onChange={(assignee_id) => update("tasks", sub.id, { assignee_id })} />
              <DuePicker task={sub} compact onChange={(due_on) => update("tasks", sub.id, { due_on })} />
              <button type="button" className="ghost tiny" onClick={() => onOpen(sub.id)} aria-label="Open subtask">
                <Icon name="chevron" size={12} />
              </button>
            </div>
          ))}
          <QuickAdd placeholder="Add subtask" onAdd={(title) =>
            createTask({ title, space_id: task.space_id, parent_id: task.id, project_id: task.project_id })} />
        </div>

        <h3 className="pane-label">Comments</h3>
        <div className="comments">
          {comments.map((c) => {
            const author = c.author_id ? s.profiles[c.author_id] : null;
            return (
              <div key={c.id} className="comment">
                <Avatar profile={author} size={24} />
                <div className="comment-body">
                  <div className="comment-head">
                    <strong>{author?.name ?? "Someone"}</strong>
                    <span className="muted">{timeAgo(c.created_at)}</span>
                    {c.author_id === s.me && (
                      <button type="button" className="ghost tiny" onClick={() => remove("comments", c.id)} aria-label="Delete comment">
                        <Icon name="trash" size={12} />
                      </button>
                    )}
                  </div>
                  <p>{c.body}</p>
                </div>
              </div>
            );
          })}
          <div className="composer">
            <Avatar profile={s.me ? s.profiles[s.me] : null} size={24} />
            <textarea value={comment} rows={2} placeholder="Add a comment… (⌘↵ to send)"
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  postComment();
                }
              }} />
            <button type="button" className="primary" disabled={!comment.trim()} onClick={postComment}>Comment</button>
          </div>
        </div>

        <p className="pane-foot muted">
          Created {creator ? `by ${creator.name} ` : ""}{timeAgo(task.created_at)}
          {task.completed_at && ` · completed ${timeAgo(task.completed_at)}`}
        </p>
      </div>
    </aside>
  );
}
