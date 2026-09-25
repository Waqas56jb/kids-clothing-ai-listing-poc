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

-- Upgrades for tables that already exist in production.
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('published', 'reserved', 'sold', 'unpublished'));
alter table public.offers add column if not exists counter_amount int;
alter table public.offers add column if not exists counter_message text;
alter table public.offers drop constraint if exists offers_status_check;
alter table public.offers add constraint offers_status_check
  check (status in ('pending', 'countered', 'accepted', 'declined', 'cancelled', 'completed'));

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  price int not null default 0,
  offer_id uuid references public.offers (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'cancelled')),
  total int not null default 0,
  currency text not null default 'SEK',
  shipping jsonb not null default '{}'::jsonb,
  payment_provider text not null default 'test',
  payment_ref text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  seller_id uuid references public.profiles (id) on delete set null,
  offer_id uuid references public.offers (id) on delete set null,
  title text not null,
  price int not null default 0,
  cover_image text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stripe Connect: a "separate charges and transfers" marketplace. The buyer
-- pays Miniplagg's own platform account (one Checkout Session covers a cart
-- that can span several sellers), then once payment is confirmed a Transfer
-- moves each seller's own cut to their connected account, keeping the
-- commission behind automatically -- there's no per-seller destination on
-- the charge itself, since a Checkout Session only supports one destination
-- and a cart routinely has more than one seller in it.
alter table public.profiles add column if not exists stripe_account_id text unique;
alter table public.profiles add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.profiles add column if not exists stripe_payouts_enabled boolean not null default false;
alter table public.profiles add column if not exists stripe_details_submitted boolean not null default false;
alter table public.profiles add column if not exists stripe_onboarding_updated_at timestamptz;

alter table public.orders add column if not exists stripe_payment_intent_id text;
alter table public.orders add column if not exists refunded_amount int not null default 0;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending_payment', 'paid', 'cancelled', 'refunded', 'partially_refunded', 'payment_failed'));

alter table public.order_items add column if not exists commission_percent numeric(5,2);
alter table public.order_items add column if not exists commission_amount int not null default 0;
alter table public.order_items add column if not exists seller_amount int not null default 0;
alter table public.order_items add column if not exists stripe_transfer_id text;
alter table public.order_items add column if not exists transfer_status text not null default 'not_applicable';
alter table public.order_items drop constraint if exists order_items_transfer_status_check;
alter table public.order_items add constraint order_items_transfer_status_check
  check (transfer_status in ('not_applicable', 'pending', 'pending_onboarding', 'transferred', 'failed', 'reversed', 'cancelled'));
alter table public.order_items add column if not exists refunded_amount int not null default 0;
alter table public.order_items drop constraint if exists order_items_status_check;
alter table public.order_items add constraint order_items_status_check
  check (status in ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded', 'partially_refunded'));

-- One row per Stripe event id so a retried/duplicated webhook delivery is
-- only ever acted on once (Stripe explicitly does not guarantee exactly-once
-- delivery -- this table is what makes our handler idempotent).
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid references public.order_items (id) on delete set null,
  amount int not null,
  reason text,
  stripe_refund_id text,
  stripe_transfer_reversal_id text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists refunds_order_idx on public.refunds (order_id);
create index if not exists order_items_transfer_status_idx on public.order_items (transfer_status);
create index if not exists profiles_stripe_account_idx on public.profiles (stripe_account_id);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists messages_listing_idx on public.messages (listing_id, created_at);
create index if not exists messages_recipient_idx on public.messages (recipient_id, read_at);
create index if not exists orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index if not exists order_items_seller_idx on public.order_items (seller_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items (order_id);

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

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists refunds_updated_at on public.refunds;
create trigger refunds_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();
