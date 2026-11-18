-- AxisLab 6 Robotics Simulator — Production Supabase Schema & RLS Policies
-- Run this SQL in your Supabase SQL Editor to set up public registration, profiles, feedback, and demonstrations.

create extension if not exists "pgcrypto";

-- 1. Public Email Registration Table
-- Open to the general public: stores email address and display name via a public INSERT RLS policy.
create table if not exists public.email_registrations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null default '',
  source text not null default 'public_registration',
  created_at timestamptz not null default now()
);

alter table public.email_registrations enable row level security;

-- Public policy to store emails from public registration forms
drop policy if exists "Public insert email registrations" on public.email_registrations;
create policy "Public insert email registrations"
  on public.email_registrations
  for insert
  to anon, authenticated
  with check (
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

-- Restrict reading email registrations to authenticated user's own email (prevents public email scraping)
drop policy if exists "Users read own email registration" on public.email_registrations;
create policy "Users read own email registration"
  on public.email_registrations
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = email);

-- 2. User Profiles (linked to Supabase Auth users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default 'Visitor',
  bio text not null default '',
  avatar_color text not null default 'amber' check (avatar_color in ('amber', 'sky', 'emerald', 'rose', 'slate')),
  default_control_mode text not null default 'joint' check (default_control_mode in ('joint', 'ik')),
  show_joint_axes_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Automatically provision a profile whenever a user verifies via Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  resolved_name text;
begin
  resolved_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, resolved_name)
  on conflict (id) do nothing;

  insert into public.email_registrations (email, display_name, source)
  values (new.email, resolved_name, 'supabase_auth_signup')
  on conflict (email) do update
    set display_name = case
      when coalesce(public.email_registrations.display_name, '') = '' then excluded.display_name
      else public.email_registrations.display_name
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Product Feedback Table
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null default '',
  category text not null check (category in ('Feature Request', 'Physics & Kinematics', 'UI / Workflow', 'Bug Report')),
  rating integer not null check (rating >= 1 and rating <= 5),
  message text not null check (char_length(message) >= 3),
  app_view text not null default 'site',
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "Public insert feedback" on public.feedback;
create policy "Public insert feedback"
  on public.feedback
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users read own feedback" on public.feedback;
create policy "Users read own feedback"
  on public.feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 4. Saved Robot Demonstrations Table
create table if not exists public.demonstrations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  task_type text not null,
  duration_ms integer not null default 0,
  frames_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.demonstrations enable row level security;

drop policy if exists "Users manage own demonstrations" on public.demonstrations;
create policy "Users manage own demonstrations"
  on public.demonstrations
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
