-- Blnq v3 Database Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/qugvxnpkwekufecvfevd/sql)

-- Enable required extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  tier text not null default 'free',
  is_admin boolean not null default false,
  storage_used bigint not null default 0,
  bytes_uploaded_total bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_tier on public.profiles(tier);

-- Bundles table
create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  slug text unique not null,
  title text,
  password_hash text,
  view_count bigint not null default 0,
  is_nsfw boolean not null default false,
  thumbnail_r2_key text,
  created_at timestamptz not null default now()
);

-- Uploads table
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  bundle_id uuid references public.bundles(id) on delete set null,
  slug text unique not null,
  r2_key text not null,
  original_ext text,
  file_type text,
  file_size bigint,
  password_hash text,
  expires_at timestamptz,
  expires_after_views integer check (expires_after_views is null or (expires_after_views between 1 and 100)),
  expiry_message text,
  view_count bigint not null default 0,
  position integer not null default 0,
  qr_r2_key text,
  is_nsfw boolean not null default false,
  scheduled_delete_at timestamptz,
  deleted_at timestamptz,
  dmca_removed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_uploads_user_id on public.uploads(user_id);
create index if not exists idx_uploads_slug on public.uploads(slug);
create index if not exists idx_uploads_bundle_id on public.uploads(bundle_id);
create index if not exists idx_uploads_position on public.uploads(bundle_id, position);
create index if not exists idx_uploads_scheduled_delete_at on public.uploads(scheduled_delete_at) where scheduled_delete_at is not null;

create index if not exists idx_bundles_user_id on public.bundles(user_id);
create index if not exists idx_bundles_slug on public.bundles(slug);

-- Vanity URLs
create table if not exists public.vanity_urls (
  alias text primary key,
  target_slug text not null,
  target_type text not null check (target_type in ('file','bundle')),
  user_id uuid references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_vanity_target on public.vanity_urls(target_slug, target_type);

-- API Keys
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  label text,
  key_hash text not null unique,
  last_used_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_user on public.api_keys(user_id);

-- Bundle reactions
create table if not exists public.bundle_reactions (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid references public.bundles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','🔥','😮','😂')),
  ip_hash text not null,
  created_at timestamptz not null default now(),
  unique(bundle_id, ip_hash)
);

-- Bundle comments
create table if not exists public.bundle_comments (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid references public.bundles(id) on delete cascade,
  user_id uuid references auth.users on delete set null,
  guest_name text,
  parent_id uuid references public.bundle_comments(id) on delete cascade,
  body text not null,
  is_flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_bundle_comments_bundle on public.bundle_comments(bundle_id);
create index if not exists idx_bundle_comments_parent on public.bundle_comments(parent_id);

-- DMCA requests
create table if not exists public.dmca_requests (
  id uuid primary key default gen_random_uuid(),
  complainant_name text not null,
  complainant_email text not null,
  file_url text not null,
  description text,
  signature text not null,
  actioned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Abuse reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  reason text,
  contact text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_slug on public.reports(slug);

-- Increment view helper function
create or replace function public.increment_views(row_id uuid, table_name text)
returns void as $$
begin
  execute format('update %I set view_count = view_count + 1 where id = $1', table_name) using row_id;
end;
$$ language plpgsql;

-- Row Level Security setup
alter table public.profiles enable row level security;
alter table public.uploads enable row level security;
alter table public.bundles enable row level security;
alter table public.api_keys enable row level security;
alter table public.vanity_urls enable row level security;
alter table public.bundle_comments enable row level security;
alter table public.bundle_reactions enable row level security;

-- Profiles policies
create policy if not exists "Profiles are viewable by owner" on public.profiles
  for select using (auth.uid() = id);
create policy if not exists "Profiles are updatable by owner" on public.profiles
  for update using (auth.uid() = id);

-- Uploads policies
create policy if not exists "Users can view their uploads" on public.uploads for select
  using (auth.uid() = user_id);
create policy if not exists "Users can insert their uploads" on public.uploads for insert
  with check (auth.uid() = user_id);
create policy if not exists "Users can update their uploads" on public.uploads for update
  using (auth.uid() = user_id);
create policy if not exists "Users can delete their uploads" on public.uploads for delete
  using (auth.uid() = user_id);

create policy if not exists "Anyone can read upload by slug" on public.uploads for select using (true);

-- Bundles policies
create policy if not exists "Users can view their bundles" on public.bundles for select
  using (auth.uid() = user_id);
create policy if not exists "Users can insert their bundles" on public.bundles for insert
  with check (auth.uid() = user_id);
create policy if not exists "Users can update their bundles" on public.bundles for update
  using (auth.uid() = user_id);
create policy if not exists "Users can delete their bundles" on public.bundles for delete
  using (auth.uid() = user_id);
create policy if not exists "Anyone can read bundle by slug" on public.bundles for select using (true);

-- Comments policies
create policy if not exists "Bundle comments readable" on public.bundle_comments for select using (true);
create policy if not exists "Bundle comments insert" on public.bundle_comments for insert with check (true);
create policy if not exists "Bundle comments update/delete by owner" on public.bundle_comments for all using (auth.uid() = user_id);

-- Reactions policies
create policy if not exists "Bundle reactions readable" on public.bundle_reactions for select using (true);
create policy if not exists "Bundle reactions insert" on public.bundle_reactions for insert with check (true);

-- API keys policies
create policy if not exists "API keys readable" on public.api_keys for select using (auth.uid() = user_id);
create policy if not exists "API keys writable" on public.api_keys for all using (auth.uid() = user_id);

-- Vanity URLs policies
create policy if not exists "Vanity URLs readable" on public.vanity_urls for select using (auth.uid() = user_id);
create policy if not exists "Vanity URLs writable" on public.vanity_urls for all using (auth.uid() = user_id);

-- Note: Worker uses service_role key which bypasses RLS where necessary.
