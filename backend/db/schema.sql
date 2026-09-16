-- Plain Postgres schema for AWS (no Supabase auth / RLS).

create extension if not exists pgcrypto;

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
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  role text not null default 'seller' check (role in ('seller', 'admin')),
  password_hash text not null,
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

-- Add password_hash if upgrading from an older profiles table.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'password_hash'
  ) then
    alter table public.profiles add column password_hash text;
  end if;
end $$;

create table if not exists public.job_files (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('original', 'crop', 'mask', 'artifact')),
  storage_path text not null unique,
  content_type text,
  created_at timestamptz not null default now()
);

-- Marketplace: a published listing is a snapshot of one garment at the moment
-- the seller pressed "Publicera" (edits after that go through the listing).
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  job_id text references public.jobs (id) on delete set null,
  garment_id text,
  seller_id uuid references public.profiles (id) on delete set null,
  title text not null,
  description text not null default '',
  category text,
  brand text,
  size text,
  color text,
  condition text,
  gender text,
  defects text,
  price int not null default 0,
  currency text not null default 'SEK',
  images jsonb not null default '[]'::jsonb,
  cover_image text,
  status text not null default 'published' check (status in ('published', 'sold', 'unpublished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, garment_id)
);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid references public.profiles (id) on delete set null,
  seller_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'offer' check (kind in ('offer', 'buy')),
  amount int not null default 0,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_status_created_idx on public.listings (status, created_at desc);
create index if not exists listings_seller_id_idx on public.listings (seller_id);
create index if not exists listings_category_idx on public.listings (category);
create index if not exists offers_seller_id_idx on public.offers (seller_id);
create index if not exists offers_buyer_id_idx on public.offers (buyer_id);

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

drop trigger if exists listings_updated_at on public.listings;
create trigger listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();
