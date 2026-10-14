-- Talaria — database schema.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run: everything is "if not exists" / "or replace".
--
-- Work is divided into spaces (Sea of Grass, Caduceus). Each space has its own
-- member list, by email. Someone can only ever see the spaces they are a
-- member of — so a future Caduceus member never sees Sea of Grass work.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.spaces (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id   uuid not null references public.spaces on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  primary key (space_id, email)
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null default '',
  email      text not null default '',
  color      text not null default '#6b7f5e',
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces on delete cascade,
  name       text not null default 'Untitled project',
  color      text not null default '#6b7f5e',
  position   double precision not null default 0,
  archived   boolean not null default false,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sections (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  name       text not null default 'Untitled section',
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces on delete cascade,
  project_id   uuid references public.projects on delete cascade,
  section_id   uuid references public.sections on delete set null,
  parent_id    uuid references public.tasks on delete cascade,
  title        text not null default '',
  notes        text not null default '',
  assignee_id  uuid references public.profiles on delete set null,
  due_on       date,
  completed_at timestamptz,
  position     double precision not null default 0,
  created_by   uuid references public.profiles on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces on delete cascade,
  task_id    uuid not null references public.tasks on delete cascade,
  author_id  uuid references public.profiles on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists projects_space_idx on public.projects (space_id);
create index if not exists sections_proj_idx  on public.sections (project_id);
create index if not exists tasks_space_idx    on public.tasks (space_id);
create index if not exists tasks_project_idx  on public.tasks (project_id);
create index if not exists tasks_parent_idx   on public.tasks (parent_id);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists comments_task_idx  on public.comments (task_id);
create index if not exists members_email_idx  on public.space_members (lower(email));

-- ---------------------------------------------------------------------------
-- The two spaces, and who is in them.
-- >>> Replace the two example addresses before running. <<<
-- To add someone to Caduceus later, run just:
--   insert into public.space_members (space_id, email)
--   select id, 'them@example.com' from public.spaces where slug = 'caduceus';
-- ---------------------------------------------------------------------------
insert into public.spaces (slug, name, position) values
  ('sea-of-grass', 'Sea of Grass', 1),
  ('caduceus',     'Caduceus',     2)
on conflict (slug) do nothing;

insert into public.space_members (space_id, email)
select s.id, m.email
from public.spaces s
cross join (values ('you@example.com'), ('bryce@example.com')) as m(email)
where s.slug in ('sea-of-grass', 'caduceus')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.my_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.in_space(sid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = sid and lower(email) = public.my_email()
  );
$$;

-- People you can see: anyone who shares at least one space with you.
create or replace function public.shares_space_with(profile_email text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.space_members a
    join public.space_members b on a.space_id = b.space_id
    where lower(a.email) = public.my_email() and lower(b.email) = lower(profile_email)
  );
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- A profile row for every new account, named from the sign-up form.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.spaces        enable row level security;
alter table public.space_members enable row level security;
alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.sections      enable row level security;
alter table public.tasks         enable row level security;
alter table public.comments      enable row level security;

-- Spaces and memberships are read-only from the app; manage them in SQL.
drop policy if exists "members read space" on public.spaces;
create policy "members read space" on public.spaces
  for select to authenticated using (public.in_space(id));

drop policy if exists "members read members" on public.space_members;
create policy "members read members" on public.space_members
  for select to authenticated using (public.in_space(space_id));

drop policy if exists "see shared profiles" on public.profiles;
create policy "see shared profiles" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_space_with(email));

drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['projects','sections','tasks','comments'] loop
    execute format('drop policy if exists "space members full access" on public.%I', t);
    execute format(
      'create policy "space members full access" on public.%I for all to authenticated
         using (public.in_space(space_id)) with check (public.in_space(space_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: push every change to the other person's app.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['spaces','profiles','projects','sections','tasks','comments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
