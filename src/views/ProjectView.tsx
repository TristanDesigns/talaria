import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, type ReactNode } from "react";
import { AssigneePicker, Check, DueBadge, EditableText, Icon, Menu, QuickAdd } from "../components/bits";
import { SortableTaskRow, TaskRow } from "../components/TaskRow";
import { createSection, createTask, toggleComplete } from "../lib/actions";
import { between, remove, update, useStore } from "../lib/store";
import type { ID, Project, Section, Task } from "../lib/types";
import { byPosition, PROJECT_COLORS, sectionsOf, subtasksOf } from "../lib/util";

export type Layout = "list" | "board";

const NONE = "none"; // bucket for tasks whose section was deleted
const bucketId = (sectionId: ID | null) => "section:" + (sectionId ?? NONE);

interface Props {
  project: Project;
  layout: Layout;
  onLayout: (l: Layout) => void;
  selectedId: ID | null;
  onOpen: (id: ID) => void;
  onDeleted: () => void;
}

export function ProjectView({ project, layout, onLayout, selectedId, onOpen, onDeleted }: Props) {
  const s = useStore();
  const [showDone, setShowDone] = useState(false);
  const sections = sectionsOf(s.sections, project.id);

  // Tasks per section, in order. Completed tasks are hidden unless asked for.
  const buckets = useMemo(() => {
    const map = new Map<string, Task[]>();
    map.set(bucketId(null), []);
    sections.forEach((sec) => map.set(bucketId(sec.id), []));
    Object.values(s.tasks)
      .filter((t) => t.project_id === project.id && !t.parent_id && (showDone || !t.completed_at))
      .sort(byPosition)
      .forEach((t) => (map.get(bucketId(t.section_id)) ?? map.get(bucketId(null))!).push(t));
    return map;
  }, [s.tasks, sections, project.id, showDone]);

  const columns: { id: string; section: Section | null }[] = [
    ...(buckets.get(bucketId(null))!.length ? [{ id: bucketId(null), section: null }] : []),
    ...sections.map((sec) => ({ id: bucketId(sec.id), section: sec })),
  ];

  // ---- drag and drop -------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [dragging, setDragging] = useState<Task | null>(null);

  const findBucket = (id: string) =>
    id.startsWith("section:") ? id : [...buckets].find(([, list]) => list.some((t) => t.id === id))?.[0];

  const onDragStart = (e: DragStartEvent) => setDragging(s.tasks[String(e.active.id)] ?? null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || active.id === over.id) return;
    const to = findBucket(String(over.id));
    if (!to) return;
    const target = buckets.get(to)!.filter((t) => t.id !== active.id);
    let index = target.length; // dropped on the column itself → bottom
    if (!String(over.id).startsWith("section:")) {
      index = target.findIndex((t) => t.id === over.id);
      // Released over the lower half of a task → goes after it.
      const r = active.rect.current.translated;
      if (r && r.top + r.height / 2 > over.rect.top + over.rect.height / 2) index += 1;
    }
    const sectionId = to.slice("section:".length);
    update("tasks", String(active.id), {
      section_id: sectionId === NONE ? null : sectionId,
      position: between(target[index - 1]?.position, target[index]?.position),
    });
  };

  const addTask = (section: Section | null, title: string) =>
    createTask({ title, space_id: project.space_id, project_id: project.id, section_id: section?.id ?? null });

  return (
    <div className="view">
      <header className="view-head" data-tauri-drag-region>
        <span className="project-dot" style={{ background: project.color }} />
        <EditableText className="view-title" value={project.name}
          onSave={(name) => update("projects", project.id, { name: name || "Untitled project" })} />
        <Menu align="right" trigger={(t) => (
          <button type="button" className="ghost" onClick={t} aria-label="Project options"><Icon name="more" /></button>
        )}>
          {(close) => (
            <>
              <div className="menu-swatches">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={"Colour " + c}
                    onClick={() => (update("projects", project.id, { color: c }), close())} />
                ))}
              </div>
              <button type="button" className="menu-item danger" onClick={() => {
                if (confirm(`Delete “${project.name}” and all of its tasks?`)) {
                  close();
                  remove("projects", project.id);
                  onDeleted();
                }
              }}>
                <Icon name="trash" size={14} /> Delete project
              </button>
            </>
          )}
        </Menu>
      </header>

      <div className="view-tabs">
        <button type="button" className={layout === "list" ? "is-on" : ""} onClick={() => onLayout("list")}>
          <Icon name="list" size={14} /> List
        </button>
        <button type="button" className={layout === "board" ? "is-on" : ""} onClick={() => onLayout("board")}>
          <Icon name="board" size={14} /> Board
        </button>
        <span className="spacer" />
        <label className="toggle">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed
        </label>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}>
        {layout === "list" ? (
          <div className="list">
            <div className="list-colheads">
              <span>Task name</span>
              <span>Assignee</span>
              <span>Due</span>
            </div>
            {columns.map(({ id, section }) => (
              <ListSection key={id} id={id} section={section} tasks={buckets.get(id)!}>
                {buckets.get(id)!.map((t) => (
                  <SortableTaskRow key={t.id} task={t} selected={t.id === selectedId} onOpen={() => onOpen(t.id)} />
                ))}
                <QuickAdd placeholder="Add task…" className="list-add" onAdd={(title) => addTask(section, title)} />
              </ListSection>
            ))}
            <QuickAdd placeholder="Add section" className="add-section" onAdd={(n) => createSection(project.id, n)} />
          </div>
        ) : (
          <div className="board">
            {columns.map(({ id, section }) => (
              <BoardColumn key={id} id={id} section={section} tasks={buckets.get(id)!}>
                {buckets.get(id)!.map((t) => (
                  <SortableCard key={t.id} task={t} selected={t.id === selectedId} onOpen={() => onOpen(t.id)} />
                ))}
                <QuickAdd placeholder="Add task" className="card-add" onAdd={(title) => addTask(section, title)} />
              </BoardColumn>
            ))}
            <div className="board-col board-col-new">
              <QuickAdd placeholder="Add section" onAdd={(n) => createSection(project.id, n)} />
            </div>
          </div>
        )}
        <DragOverlay dropAnimation={null}>
          {dragging &&
            (layout === "list" ? (
              <div className="drag-ghost"><TaskRow task={dragging} selected={false} onOpen={() => {}} /></div>
            ) : (
              <Card task={dragging} selected={false} onOpen={() => {}} ghost />
            ))}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionTitle({ section }: { section: Section | null }) {
  if (!section) return <span className="section-name muted">No section</span>;
  return (
    <>
      <EditableText className="section-name" fit value={section.name}
        onSave={(name) => update("sections", section.id, { name: name || "Untitled section" })} />
      <Menu align="right" trigger={(t) => (
        <button type="button" className="ghost section-more" onClick={t} aria-label="Section options"><Icon name="more" /></button>
      )}>
        {(close) => (
          <button type="button" className="menu-item danger" onClick={() => {
            close();
            remove("sections", section.id);
          }}>
            <Icon name="trash" size={14} /> Delete section (keeps its tasks)
          </button>
        )}
      </Menu>
    </>
  );
}

function ListSection({ id, section, tasks, children }: {
  id: string; section: Section | null; tasks: Task[]; children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section className={"list-section" + (isOver ? " is-over" : "")} ref={setNodeRef}>
      <div className="list-section-head">
        <button type="button" className={"ghost caret" + (open ? " is-open" : "")} onClick={() => setOpen(!open)}
          aria-label={open ? "Collapse section" : "Expand section"}>
          <Icon name="chevron" size={12} />
        </button>
        <SectionTitle section={section} />
        <span className="count">{tasks.length}</span>
      </div>
      {open && (
        <SortableContext id={id} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      )}
    </section>
  );
}

function BoardColumn({ id, section, tasks, children }: {
  id: string; section: Section | null; tasks: Task[]; children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section className={"board-col" + (isOver ? " is-over" : "")} ref={setNodeRef}>
      <div className="board-col-head">
        <SectionTitle section={section} />
        <span className="count">{tasks.length}</span>
      </div>
      <SortableContext id={id} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="board-cards">{children}</div>
      </SortableContext>
    </section>
  );
}

function Card({ task, selected, onOpen, ghost }: { task: Task; selected: boolean; onOpen: () => void; ghost?: boolean }) {
  const s = useStore();
  const subs = subtasksOf(s.tasks, task.id);
  return (
    <div className={"card" + (selected ? " is-selected" : "") + (task.completed_at ? " is-done" : "") + (ghost ? " is-ghost" : "")}
      onClick={onOpen}>
      <div className="card-top">
        <Check done={!!task.completed_at} onToggle={() => toggleComplete(task)} size={16} />
        <span className="card-title">{task.title || <span className="muted">Untitled task</span>}</span>
      </div>
      <div className="card-meta">
        <AssigneePicker value={task.assignee_id} profiles={Object.values(s.profiles)} size={20}
          onChange={(assignee_id) => update("tasks", task.id, { assignee_id })} />
        <DueBadge task={task} />
        <span className="spacer" />
        {subs.length > 0 && (
          <span className="meta">
            {subs.filter((x) => x.completed_at).length}/{subs.length} <Icon name="subtask" size={12} />
          </span>
        )}
      </div>
    </div>
  );
}

function SortableCard(props: { task: Task; selected: boolean; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
      <Card {...props} />
    </div>
  );
}
