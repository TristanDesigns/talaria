-- Talaria — files on tasks.
-- A private "attachments" bucket, laid out as <space_id>/<task_id>/<file>,
-- and a table describing each file. Only members of a space can read, add or
-- remove that space's files. Safe to re-run.

create table if not exists public.attachments (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces on delete cascade,
  task_id     uuid not null references public.tasks on delete cascade,
  name        text not null,
  path        text not null unique,
  size        bigint not null default 0,
  mime        text not null default '',
  uploaded_by uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists attachments_task_idx on public.attachments (task_id);

alter table public.attachments enable row level security;

drop policy if exists "space members full access" on public.attachments;
create policy "space members full access" on public.attachments for all to authenticated
  using (public.in_space(space_id)) with check (public.in_space(space_id));

-- Storage: the first folder of every path is the space id.
create or replace function public.in_space_path(object_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id::text = (storage.foldername(object_name))[1]
      and lower(email) = public.my_email()
  );
$$;

-- 50 MB is the most a single file can be on Supabase's free plan.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "attachments: members read" on storage.objects;
create policy "attachments: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.in_space_path(name));

drop policy if exists "attachments: members add" on storage.objects;
create policy "attachments: members add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.in_space_path(name));

drop policy if exists "attachments: members remove" on storage.objects;
create policy "attachments: members remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and public.in_space_path(name));

-- Live updates for the file list.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attachments'
  ) then
    alter publication supabase_realtime add table public.attachments;
  end if;
end $$;
