begin;

create extension if not exists "pgcrypto";

-- WICHTIG: Kein automatisches DROP mehr, damit Trainingsdaten erhalten bleiben.
-- Fuer einen DEV-Reset koennen die folgenden Zeilen manuell aktiviert werden:
-- drop table if exists public.sets cascade;
-- drop table if exists public.workout_exercises cascade;
-- drop table if exists public.workouts cascade;
-- drop table if exists public.weekly_plan_days cascade;
-- drop table if exists public.exercises cascade;
-- drop table if exists public.profiles cascade;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  muscle_group text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_plan_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  title text not null default 'Ruhetag',
  is_rest_day boolean not null default true,
  position smallint not null check (position between 0 and 6),
  notes text,
  planned_exercise_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  title text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number integer not null check (set_number > 0),
  weight numeric(6,2) not null check (weight >= 0),
  reps integer not null check (reps > 0),
  rpe numeric(3,1),
  created_at timestamptz not null default now()
);

create table if not exists public.workout_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null,
  version_number integer not null,
  reason text not null default 'update',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.weekly_plan_days
  add column if not exists planned_exercise_ids uuid[] not null default '{}';

-- Dedupliziert Alt-Daten, damit ein eindeutiger Wochentag pro Nutzer garantiert werden kann.
with ranked_days as (
  select
    id,
    row_number() over (
      partition by user_id, day_of_week
      order by created_at asc, id asc
    ) as rn
  from public.weekly_plan_days
)
delete from public.weekly_plan_days
where id in (
  select id from ranked_days where rn > 1
);

create index if not exists exercises_user_id_idx on public.exercises (user_id);
create index if not exists exercises_public_idx on public.exercises (is_public);
create index if not exists weekly_plan_days_user_position_idx on public.weekly_plan_days (user_id, position);
create index if not exists workouts_user_date_idx on public.workouts (user_id, date desc);
create index if not exists workout_exercises_workout_idx on public.workout_exercises (workout_id, position);
create index if not exists sets_workout_idx on public.sets (workout_id, workout_exercise_id, set_number);
create unique index if not exists weekly_plan_days_user_day_unique on public.weekly_plan_days (user_id, day_of_week);
create unique index if not exists workout_exercises_position_unique on public.workout_exercises (workout_id, position);
create unique index if not exists sets_exercise_set_number_unique on public.sets (workout_exercise_id, set_number);
create index if not exists workout_versions_workout_idx on public.workout_versions (workout_id, version_number desc);

insert into public.exercises (name, muscle_group, is_public)
values
  ('Bankdrücken', 'Brust', true),
  ('Schrägbankdrücken', 'Brust', true),
  ('Kurzhantel-Bankdrücken', 'Brust', true),
  ('Schulterdrücken', 'Schultern', true),
  ('Seitheben', 'Schultern', true),
  ('Kniebeuge', 'Beine', true),
  ('Beinpresse', 'Beine', true),
  ('Kreuzheben', 'Rücken', true),
  ('Rumänisches Kreuzheben', 'Rücken', true),
  ('Latzug', 'Rücken', true),
  ('Klimmzüge', 'Rücken', true),
  ('Rudern', 'Rücken', true),
  ('Bizepscurls', 'Bizeps', true),
  ('Trizepsdrücken', 'Trizeps', true)
on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.weekly_plan_days to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;
grant select, insert, update, delete on public.workout_exercises to authenticated;
grant select, insert, update, delete on public.sets to authenticated;
grant select, insert on public.workout_versions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.weekly_plan_days enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;
alter table public.workout_versions enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists exercises_select_public_or_own on public.exercises;
drop policy if exists exercises_insert_own on public.exercises;
drop policy if exists exercises_update_own on public.exercises;
drop policy if exists exercises_delete_own on public.exercises;
drop policy if exists weekly_plan_days_select_own on public.weekly_plan_days;
drop policy if exists weekly_plan_days_insert_own on public.weekly_plan_days;
drop policy if exists weekly_plan_days_update_own on public.weekly_plan_days;
drop policy if exists weekly_plan_days_delete_own on public.weekly_plan_days;
drop policy if exists workouts_select_own on public.workouts;
drop policy if exists workouts_insert_own on public.workouts;
drop policy if exists workouts_update_own on public.workouts;
drop policy if exists workouts_delete_own on public.workouts;
drop policy if exists workout_exercises_select_own on public.workout_exercises;
drop policy if exists workout_exercises_insert_own on public.workout_exercises;
drop policy if exists workout_exercises_update_own on public.workout_exercises;
drop policy if exists workout_exercises_delete_own on public.workout_exercises;
drop policy if exists sets_select_own on public.sets;
drop policy if exists sets_insert_own on public.sets;
drop policy if exists sets_update_own on public.sets;
drop policy if exists sets_delete_own on public.sets;
drop policy if exists workout_versions_select_own on public.workout_versions;
drop policy if exists workout_versions_insert_own on public.workout_versions;

create policy profiles_select_own on public.profiles
for select to authenticated
using (auth.uid() = id);

create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (auth.uid() = id);

create policy profiles_update_own on public.profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy exercises_select_public_or_own on public.exercises
for select to authenticated
using (is_public or auth.uid() = user_id);

create policy exercises_insert_own on public.exercises
for insert to authenticated
with check (auth.uid() = user_id and is_public = false);

create policy exercises_update_own on public.exercises
for update to authenticated
using (auth.uid() = user_id and is_public = false)
with check (auth.uid() = user_id and is_public = false);

create policy exercises_delete_own on public.exercises
for delete to authenticated
using (auth.uid() = user_id and is_public = false);

create policy weekly_plan_days_select_own on public.weekly_plan_days
for select to authenticated
using (auth.uid() = user_id);

create policy weekly_plan_days_insert_own on public.weekly_plan_days
for insert to authenticated
with check (auth.uid() = user_id);

create policy weekly_plan_days_update_own on public.weekly_plan_days
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy weekly_plan_days_delete_own on public.weekly_plan_days
for delete to authenticated
using (auth.uid() = user_id);

create policy workouts_select_own on public.workouts
for select to authenticated
using (auth.uid() = user_id);

create policy workouts_insert_own on public.workouts
for insert to authenticated
with check (auth.uid() = user_id);

create policy workouts_update_own on public.workouts
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy workouts_delete_own on public.workouts
for delete to authenticated
using (auth.uid() = user_id);

create policy workout_exercises_select_own on public.workout_exercises
for select to authenticated
using (auth.uid() = user_id);

create policy workout_exercises_insert_own on public.workout_exercises
for insert to authenticated
with check (auth.uid() = user_id);

create policy workout_exercises_update_own on public.workout_exercises
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy workout_exercises_delete_own on public.workout_exercises
for delete to authenticated
using (auth.uid() = user_id);

create policy sets_select_own on public.sets
for select to authenticated
using (auth.uid() = user_id);

create policy sets_insert_own on public.sets
for insert to authenticated
with check (auth.uid() = user_id);

create policy sets_update_own on public.sets
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy sets_delete_own on public.sets
for delete to authenticated
using (auth.uid() = user_id);

create policy workout_versions_select_own on public.workout_versions
for select to authenticated
using (auth.uid() = user_id);

create policy workout_versions_insert_own on public.workout_versions
for insert to authenticated
with check (auth.uid() = user_id);

commit;
