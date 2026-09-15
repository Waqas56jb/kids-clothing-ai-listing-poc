-- Auth profiles + persisted pipeline jobs for seller/admin login.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'seller' check (role in ('seller', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id text primary key,
  user_id uuid references public.profiles (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'error')),
  stage text,
  current int not null default 0,
  total int not null default 0,
  error text,
  image_count int not null default 0,
  garment_count int,
  result jsonb,
  workspace jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jobs add column if not exists workspace jsonb not null default '{}'::jsonb;

create table if not exists public.job_files (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('original', 'crop', 'mask', 'artifact')),
  storage_path text not null unique,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists job_files_job_id_idx on public.job_files (job_id);

create index if not exists jobs_user_id_idx on public.jobs (user_id);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_status_idx on public.jobs (status);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- New signups are always sellers. Admin is granted only via SQL / seed script.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'seller'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_user_role());

drop policy if exists "jobs_select" on public.jobs;
create policy "jobs_select"
  on public.jobs for select
  to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "jobs_insert" on public.jobs;
create policy "jobs_insert"
  on public.jobs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "jobs_update" on public.jobs;
create policy "jobs_update"
  on public.jobs for update
  to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

grant usage on schema public to authenticated, anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.jobs to authenticated;
grant select, insert on public.job_files to authenticated;
grant all on table public.jobs to service_role;
grant all on table public.profiles to service_role;
grant all on table public.job_files to service_role;

alter table public.job_files enable row level security;

drop policy if exists "job_files_select" on public.job_files;
create policy "job_files_select"
  on public.job_files for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs
      where jobs.id = job_files.job_id
        and (jobs.user_id = auth.uid() or public.current_user_role() = 'admin')
    )
  );

-- Backend saves jobs as the signed-in user. SECURITY DEFINER so a row is
-- actually written even when table RLS would drop a service-key insert.
create or replace function public.save_job(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := p->>'id';
  v_user uuid := nullif(p->>'user_id', '')::uuid;
begin
  if auth.uid() is not null
     and v_user is distinct from auth.uid()
     and coalesce(public.current_user_role(), '') is distinct from 'admin' then
    raise exception 'not allowed';
  end if;

  insert into public.jobs (
    id, user_id, status, stage, current, total, error,
    image_count, garment_count, result, created_at, updated_at
  ) values (
    v_id,
    coalesce(v_user, auth.uid()),
    coalesce(p->>'status', 'queued'),
    p->>'stage',
    coalesce((p->>'current')::int, 0),
    coalesce((p->>'total')::int, 0),
    p->>'error',
    coalesce((p->>'image_count')::int, 0),
    nullif(p->>'garment_count', '')::int,
    case
      when p->'result' is null or jsonb_typeof(p->'result') = 'null' then null
      else p->'result'
    end,
    coalesce((p->>'created_at')::timestamptz, now()),
    now()
  )
  on conflict (id) do update set
    status = excluded.status,
    stage = excluded.stage,
    current = excluded.current,
    total = excluded.total,
    error = excluded.error,
    image_count = excluded.image_count,
    garment_count = excluded.garment_count,
    result = excluded.result,
    updated_at = now();
end;
$$;

revoke all on function public.save_job(jsonb) from public;
grant execute on function public.save_job(jsonb) to authenticated;
grant execute on function public.save_job(jsonb) to service_role;
