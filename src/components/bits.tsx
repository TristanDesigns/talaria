import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ID, Profile, Task } from "../lib/types";
import { dueLabel, dueTone, initials } from "../lib/util";

// ---------------------------------------------------------------------------
// Icons — hairline strokes to match the studio mark.
// ---------------------------------------------------------------------------
const PATHS: Record<string, string> = {
  check: "M5 12.5l4.2 4.2L19 7",
  plus: "M12 5v14M5 12h14",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  board: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v11h-4z",
  me: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0",
  close: "M6 6l12 12M18 6L6 18",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  chevron: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  logout: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
  subtask: "M6 4v10a3 3 0 003 3h9M15 14l3 3-3 3",
  comment: "M4 5h16v11H9l-5 4z",
  drag: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  inbox: "M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5",
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

export function Avatar({ profile, size = 22 }: { profile?: Profile | null; size?: number }) {
  if (!profile)
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size }} title="Unassigned">
        <Icon name="me" size={size * 0.62} />
      </span>
    );
  return (
    <span className="avatar" title={profile.name}
      style={{ width: size, height: size, background: profile.color, fontSize: size * 0.4 }}>
      {initials(profile.name)}
      {profile.avatar_url && <AvatarImage src={profile.avatar_url} />}
    </span>
  );
}

// Laid over the initials, so a photo that fails to load just disappears.
function AvatarImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return null;
  return <img src={src} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} />;
}

export function Check({ done, onToggle, size = 18 }: { done: boolean; onToggle: () => void; size?: number }) {
  return (
    <button type="button" className={"check" + (done ? " is-done" : "")} style={{ width: size, height: size }}
      aria-label={done ? "Mark incomplete" : "Mark complete"} aria-pressed={done}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}>
      <Icon name="check" size={size * 0.72} />
    </button>
  );
}

export function DueBadge({ task }: { task: Pick<Task, "due_on" | "completed_at"> }) {
  if (!task.due_on) return null;
  return <span className={"due due-" + dueTone(task)}>{dueLabel(task.due_on)}</span>;
}

// Text you can edit in place; commits on blur/Enter, reverts on Esc.
//   default    single line, ellipsised when it doesn't fit
//   fit        single line, as wide as its text (section names)
//   wrap       wraps and grows, Enter still commits (task titles in the pane)
//   multiline  free text, ⌘↵ commits (descriptions)
export function EditableText({
  value, onSave, className, placeholder, multiline = false, wrap = false, fit = false, autoFocus = false,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  wrap?: boolean;
  fit?: boolean;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const reverting = useRef(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const area = multiline || wrap;
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  // Textareas grow with their content.
  useEffect(() => {
    const el = ref.current;
    if (!el || !area) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [draft, area]);

  const commit = () => {
    focused.current = false;
    if (reverting.current) {
      reverting.current = false;
      return;
    }
    const v = multiline ? draft : draft.trim();
    if (v !== value) onSave(v);
  };
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    if (e.key === "Escape") {
      e.stopPropagation();
      reverting.current = true;
      setDraft(value);
      el.blur();
    } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      el.blur();
    }
  };
  const common = {
    className: "editable " + (className ?? ""),
    value: draft,
    placeholder,
    onFocus: () => (focused.current = true),
    onBlur: commit,
    onKeyDown: onKey,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };
  if (area)
    return (
      <textarea ref={ref} rows={1} spellCheck={multiline} {...common}
        onChange={(e) => setDraft(multiline ? e.target.value : e.target.value.replace(/\n/g, ""))} />
    );
  return (
    <input ref={ref} spellCheck={false} size={fit ? Math.max(draft.length, placeholder?.length ?? 0, 3) + 1 : undefined}
      {...common} onChange={(e) => setDraft(e.target.value)} />
  );
}

// A tiny popover menu anchored to its trigger.
export function Menu({ trigger, children, align = "left" }: {
  trigger: (open: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  return (
    <span className="menu-anchor" ref={ref} onClick={(e) => e.stopPropagation()}>
      {trigger(() => setOpen((o) => !o))}
      {open && <div className={"menu menu-" + align}>{children(() => setOpen(false))}</div>}
    </span>
  );
}

export function AssigneePicker({ value, profiles, onChange, size = 22, showName = false }: {
  value: ID | null;
  profiles: Profile[];
  onChange: (id: ID | null) => void;
  size?: number;
  showName?: boolean;
}) {
  const current = profiles.find((p) => p.id === value) ?? null;
  return (
    <Menu
      trigger={(toggle) => (
        <button type="button" className="ghost assignee-btn" onClick={toggle} title="Assignee">
          <Avatar profile={current} size={size} />
          {showName && <span>{current ? current.name : "No assignee"}</span>}
        </button>
      )}>
      {(close) => (
        <>
          {profiles.map((p) => (
            <button key={p.id} type="button" className={"menu-item" + (p.id === value ? " is-on" : "")}
              onClick={() => (onChange(p.id), close())}>
              <Avatar profile={p} size={18} /> {p.name}
            </button>
          ))}
          <button type="button" className="menu-item" onClick={() => (onChange(null), close())}>
            <Avatar profile={null} size={18} /> No assignee
          </button>
        </>
      )}
    </Menu>
  );
}

export function DuePicker({ task, onChange, compact = false }: {
  task: Pick<Task, "due_on" | "completed_at">;
  onChange: (iso: string | null) => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className={"due-picker" + (compact ? " is-compact" : "")} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="ghost" onClick={() => ref.current?.showPicker?.()} title="Due date">
        {task.due_on ? <DueBadge task={task} /> : <span className="muted"><Icon name="calendar" size={14} />{!compact && " Due date"}</span>}
      </button>
      <input ref={ref} type="date" className="date-native" value={task.due_on ?? ""}
        onChange={(e) => onChange(e.target.value || null)} tabIndex={-1} aria-label="Due date" />
      {task.due_on && !compact && (
        <button type="button" className="ghost tiny" onClick={() => onChange(null)} aria-label="Clear due date">
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
}

// "Add task…" style inline input; Enter adds and stays open for the next one.
export function QuickAdd({ placeholder, onAdd, className = "" }: {
  placeholder: string;
  onAdd: (title: string) => void;
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const cancelled = useRef(false);
  if (!active)
    return (
      <button type="button" className={"quick-add " + className} onClick={() => ((cancelled.current = false), setActive(true))}>
        <Icon name="plus" size={14} /> {placeholder}
      </button>
    );
  return (
    <input autoFocus className={"quick-add-input " + className} value={text} placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() && !cancelled.current) onAdd(text.trim());
        cancelled.current = false;
        setText("");
        setActive(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && text.trim()) {
          onAdd(text.trim());
          setText("");
        } else if (e.key === "Escape") {
          cancelled.current = true;
          setText("");
          setActive(false);
        }
      }} />
  );
}
