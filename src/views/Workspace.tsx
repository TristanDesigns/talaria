import { useEffect, useState } from "react";
import { Avatar, Icon, QuickAdd } from "../components/bits";
import { Mark } from "../components/Mark";
import { createProject } from "../lib/actions";
import { clearError, resetStore, startSync, stopSync, useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import type { ID } from "../lib/types";
import { byPosition } from "../lib/util";
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
          {projects.map((p) => (
            <button key={p.id} type="button" className={"nav-item" + (project?.id === p.id ? " is-on" : "")}
              onClick={() => go({ page: p.id })}>
              <i className="project-dot" style={{ background: p.color }} /> <span className="nav-label">{p.name}</span>
            </button>
          ))}
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

      {s.error && (
        <div className="toast" role="alert">
          <span>Couldn’t save: {s.error}</span>
          <button type="button" className="ghost tiny" onClick={clearError} aria-label="Dismiss"><Icon name="close" size={12} /></button>
        </div>
      )}
    </div>
  );
}
