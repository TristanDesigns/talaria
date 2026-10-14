import { useEffect, useRef, useState } from "react";
import { Avatar, Icon, QuickAdd } from "../components/bits";
import { Mark } from "../components/Mark";
import { createProject } from "../lib/actions";
import { clearError, remove, resetStore, startSync, stopSync, update, useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import type { ID, Project } from "../lib/types";
import { byPosition, PROJECT_COLORS } from "../lib/util";
import { MyTasks } from "./MyTasks";
import { ProfileDialog } from "./ProfileDialog";
import { ProjectView, type Layout } from "./ProjectView";
import { TaskPane } from "./TaskPane";

interface Route {
  spaceId: ID | null;
  page: "my" | ID; // "my" or a project id
  layout: Layout;
}

const ROUTE_KEY = "talaria:route";

function loadRoute(): Route {
  try {
    const r = JSON.parse(localStorage.getItem(ROUTE_KEY) ?? "");
    if (r && typeof r === "object") return { spaceId: null, page: "my", layout: "list", ...r };
  } catch {
    /* first run */
  }
  return { spaceId: null, page: "my", layout: "list" };
}

export function Workspace({ me, email }: { me: ID; email: string }) {
  const s = useStore();
  const [route, setRouteState] = useState<Route>(loadRoute);
  const [selected, setSelected] = useState<ID | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [renaming, setRenaming] = useState<ID | null>(null);
  const [menu, setMenu] = useState<{ id: ID; x: number; y: number } | null>(null);

  const setRoute = (patch: Partial<Route>) =>
    setRouteState((r) => {
      const next = { ...r, ...patch };
      try {
        localStorage.setItem(ROUTE_KEY, JSON.stringify(next));
      } catch {
        /* not essential */
      }
      return next;
    });

  useEffect(() => {
    startSync(me);
    return stopSync;
  }, [me]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input, textarea, select")) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const spaces = Object.values(s.spaces).sort(byPosition);
  const space = (route.spaceId && s.spaces[route.spaceId]) || spaces[0];
  const projects = space
    ? Object.values(s.projects).filter((p) => p.space_id === space.id && !p.archived).sort(byPosition)
    : [];
  const project = route.page !== "my" ? s.projects[route.page] : undefined;
  const meProfile = s.profiles[me];

  if (!s.loaded) return <div className="loading"><Mark size={28} /></div>;

  if (!space)
    return (
      <div className="gate">
        <div className="gate-card">
          <p>You’re signed in as <strong>{email}</strong>, but that address isn’t a member of any space yet.</p>
          <p className="muted">Add it to <code>space_members</code> in Supabase (see the README), then reopen Talaria.</p>
          <button className="primary" type="button" onClick={() => (resetStore(), supabase().auth.signOut())}>Sign out</button>
        </div>
      </div>
    );

  const go = (patch: Partial<Route>) => {
    setSelected(null);
    setRoute(patch);
  };

  return (
    <div className={"shell" + (selected ? " has-pane" : "")}>
      <nav className="sidebar">
        <div className="sidebar-top" data-tauri-drag-region>
          <div className="brand">
            <Mark size={20} />
            <span className="wordmark">Talaria</span>
          </div>
        </div>

        {spaces.length > 1 && (
          <div className="spaces" role="tablist" aria-label="Spaces">
            {spaces.map((sp) => (
              <button key={sp.id} type="button" role="tab" aria-selected={sp.id === space.id}
                className={sp.id === space.id ? "is-on" : ""}
                onClick={() => go({ spaceId: sp.id, page: "my" })}>
                {sp.name}
              </button>
            ))}
          </div>
        )}

        <button type="button" className={"nav-item" + (route.page === "my" || !project ? " is-on" : "")}
          onClick={() => go({ page: "my" })}>
          <Icon name="me" size={15} /> My tasks
        </button>

        <div className="nav-head">Projects</div>
        <div className="nav-projects">
          {projects.map((p) =>
            renaming === p.id ? (
              <RenameField key={p.id} project={p} onDone={() => setRenaming(null)} />
            ) : (
              <button key={p.id} type="button" className={"nav-item" + (project?.id === p.id ? " is-on" : "")}
                title="Double-click to rename · right-click for more"
                onClick={() => go({ page: p.id })}
                onDoubleClick={() => setRenaming(p.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ id: p.id, x: e.clientX, y: e.clientY });
                }}>
                <i className="project-dot" style={{ background: p.color }} /> <span className="nav-label">{p.name}</span>
              </button>
            ),
          )}
          <QuickAdd placeholder="New project" className="nav-add"
            onAdd={(name) => go({ page: createProject(space.id, name).id })} />
        </div>

        <div className="sidebar-foot">
          <button type="button" className="me-btn" onClick={() => setProfileOpen(true)} title="Profile">
            <Avatar profile={meProfile} size={24} />
            <span className="nav-label">{meProfile?.name ?? email}</span>
          </button>
          <button type="button" className="ghost" title="Sign out"
            onClick={() => (resetStore(), supabase().auth.signOut())}>
            <Icon name="logout" size={15} />
          </button>
        </div>
      </nav>

      <main className="main">
        {project && project.space_id === space.id ? (
          <ProjectView key={project.id} project={project} layout={route.layout} onLayout={(layout) => setRoute({ layout })}
            selectedId={selected} onOpen={setSelected} onDeleted={() => go({ page: "my" })} />
        ) : (
          <MyTasks spaceId={space.id} selectedId={selected} onOpen={setSelected} />
        )}
      </main>

      {selected && <TaskPane taskId={selected} onOpen={setSelected} onClose={() => setSelected(null)} />}

      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}

      {menu && s.projects[menu.id] && (
        <ProjectMenu project={s.projects[menu.id]} x={menu.x} y={menu.y} onClose={() => setMenu(null)}
          onRename={() => setRenaming(menu.id)}
          onDeleted={() => project?.id === menu.id && go({ page: "my" })} />
      )}

      {s.error && (
        <div className="toast" role="alert">
          <span>{s.error}</span>
          <button type="button" className="ghost tiny" onClick={clearError} aria-label="Dismiss"><Icon name="close" size={12} /></button>
        </div>
      )}
    </div>
  );
}

// Inline rename in the sidebar: Enter saves, Esc cancels.
function RenameField({ project, onDone }: { project: Project; onDone: () => void }) {
  const cancelled = useRef(false);
  return (
    <div className="nav-item is-renaming">
      <i className="project-dot" style={{ background: project.color }} />
      <input className="rename-input" autoFocus defaultValue={project.name} aria-label="Project name"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (!cancelled.current && v && v !== project.name) update("projects", project.id, { name: v });
          onDone();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }} />
    </div>
  );
}

// Right-click menu for a project in the sidebar.
function ProjectMenu({ project, x, y, onClose, onRename, onDeleted }: {
  project: Project; x: number; y: number; onClose: () => void; onRename: () => void; onDeleted: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  // Keep the menu inside the window.
  const left = Math.min(x, window.innerWidth - 210);
  const top = Math.min(y, window.innerHeight - 150);
  return (
    <div ref={ref} className="menu menu-floating" style={{ left, top }} role="menu">
      <button type="button" className="menu-item" onClick={() => (onClose(), onRename())}>
        <Icon name="edit" size={14} /> Rename
      </button>
      <div className="menu-swatches">
        {PROJECT_COLORS.map((c) => (
          <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={"Colour " + c}
            onClick={() => (update("projects", project.id, { color: c }), onClose())} />
        ))}
      </div>
      <button type="button" className="menu-item danger" onClick={() => {
        onClose();
        if (confirm(`Delete “${project.name}” and all of its tasks?`)) {
          remove("projects", project.id);
          onDeleted();
        }
      }}>
        <Icon name="trash" size={14} /> Delete project
      </button>
    </div>
  );
}
