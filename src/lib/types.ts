export type ID = string;

export interface Space {
  id: ID;
  slug: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Profile {
  id: ID;
  name: string;
  email: string;
  color: string;
  created_at: string;
}

export interface Project {
  id: ID;
  space_id: ID;
  name: string;
  color: string;
  position: number;
  archived: boolean;
  created_by: ID | null;
  created_at: string;
}

export interface Section {
  id: ID;
  space_id: ID;
  project_id: ID;
  name: string;
  position: number;
  created_at: string;
}

export interface Task {
  id: ID;
  space_id: ID;
  project_id: ID | null;
  section_id: ID | null;
  parent_id: ID | null;
  title: string;
  notes: string;
  assignee_id: ID | null;
  due_on: string | null; // YYYY-MM-DD
  completed_at: string | null;
  position: number;
  created_by: ID | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: ID;
  space_id: ID;
  task_id: ID;
  author_id: ID | null;
  body: string;
  created_at: string;
}

export type Table = "spaces" | "profiles" | "projects" | "sections" | "tasks" | "comments";

export interface Rows {
  spaces: Space;
  profiles: Profile;
  projects: Project;
  sections: Section;
  tasks: Task;
  comments: Comment;
}
