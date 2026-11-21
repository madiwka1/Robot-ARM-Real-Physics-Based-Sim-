-- AxisLab 6 Robotics Simulator: Supabase schema, row-level security, and privacy functions.
-- Run this whole file in the Supabase SQL Editor (safe to re-run).
--
-- Privacy model
--   * Email addresses live only in Supabase Auth (auth.users). No app table copies them.
--   * Every table has row-level security; users can read and change only their own rows.
--   * Profiles hold a display name and simulator preferences only.
--   * Users can delete their account; profiles and demonstrations are deleted with it,
--     feedback is kept but anonymized (user_id and email cleared).

create extension if not exists "pgcrypto";

-- 0. Upgrading from an older version of this schema
--    Older versions copied every sign-up email into a publicly insertable table and into
--    profiles.email. These statements remove those copies.
drop table if exists public.email_registrations;
alter table if exists public.profiles drop column if exists email;

-- 1. User profiles (one row per auth user, created automatically on first sign-in)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Visitor' check (char_length(display_name) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_color text not null default 'amber' check (avatar_color in ('amber', 'sky', 'emerald', 'rose', 'slate')),
  default_control_mode text not null default 'joint' check (default_control_mode in ('joint', 'ik')),
  show_joint_axes_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Create the profile when a user first signs in (email magic link or Google).
-- Name: chosen display name, else Google's full name, else the part of the email before '@'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  resolved_name text;
begin
  resolved_name := left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(new.email, '@', 1)
  ), 80);

  insert into public.profiles (id, display_name)
  values (new.id, resolved_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Product feedback (anyone may submit; a signed-in user can only attach their own id)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null default '',
  category text not null check (category in ('Feature Request', 'Physics & Kinematics', 'UI / Workflow', 'Bug Report')),
  rating integer not null check (rating >= 1 and rating <= 5),
  message text not null check (char_length(message) between 3 and 4000),
  app_view text not null default 'site',
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "Public insert feedback" on public.feedback;
create policy "Public insert feedback"
  on public.feedback for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "Users read own feedback" on public.feedback;
create policy "Users read own feedback"
  on public.feedback for select to authenticated
  using (auth.uid() = user_id);

-- 3. Saved robot demonstrations (private to their owner)
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
  on public.demonstrations for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Self-service account deletion (called from the app as supabase.rpc('delete_my_account'))
--    Deletes only the calling user. Profiles and demonstrations cascade; feedback keeps the
--    message but loses the link to the person.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  update public.feedback set user_id = null, email = '' where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
