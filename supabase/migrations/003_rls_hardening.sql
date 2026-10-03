-- Migration 003: Zugriffsregeln (RLS) härten
--
-- Ändert NUR Regeln und Rechte. Es werden keine Tabellen, Spalten oder Zeilen angelegt,
-- gelöscht oder verändert, und bestehende Daten bleiben unberührt. Neue Regeln gelten
-- nur für künftige Schreibvorgänge (INSERT und UPDATE). Die Datei kann mehrfach
-- ausgeführt werden.
--
-- Warum: Fremdschlüssel (z. B. sets.workout_exercise_id) prüfen RLS nicht. Bisher
-- prüfte die Einfügeregel nur "user_id = ich". Wer eine fremde UUID kannte, konnte eigene
-- Zeilen an fremde Workouts, Übungsblöcke oder private Übungen hängen. Lesen konnte er
-- fremde Daten dadurch nicht, aber er konnte fremde Zeilen "belegen" (z. B. das Löschen
-- einer fremden Übung blockieren). Die neuen Regeln verlangen, dass die referenzierten
-- Zeilen mir gehören (oder die Übung öffentlich ist).
--
-- Außerdem darf ein angemeldeter Nutzer in "profiles" künftig nur noch display_name
-- ändern (nicht id, email, created_at).
--
-- save_workout und alle Abfragen der App bleiben gültig: Die App schreibt Workouts nur
-- über save_workout. Die Funktion legt zuerst das eigene Workout an, dann die Übungsblöcke
-- mit eigenen oder öffentlichen Übungen, dann die Sätze zu den eben angelegten eigenen
-- Blöcken. Genau das verlangen die neuen Regeln. Lesen und Löschen ändern sich nicht.
--
-- Prüfabfragen vorher und nachher: supabase/checks/003_rls_hardening_checks.sql

begin;

-- workout_exercises: Workout gehört mir, Übung ist öffentlich oder meine ---------------

drop policy if exists workout_exercises_insert_own on public.workout_exercises;
drop policy if exists workout_exercises_update_own on public.workout_exercises;

create policy workout_exercises_insert_own on public.workout_exercises
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.exercises e
    where e.id = workout_exercises.exercise_id
      and (e.is_public or e.user_id = auth.uid())
  )
);

create policy workout_exercises_update_own on public.workout_exercises
for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.workouts w
    where w.id = workout_exercises.workout_id
      and w.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.exercises e
    where e.id = workout_exercises.exercise_id
      and (e.is_public or e.user_id = auth.uid())
  )
);

-- sets: Übungsblock gehört mir und liegt im selben Workout ---------------------------------

drop policy if exists sets_insert_own on public.sets;
drop policy if exists sets_update_own on public.sets;

create policy sets_insert_own on public.sets
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.workout_exercises we
    where we.id = sets.workout_exercise_id
      and we.workout_id = sets.workout_id
      and we.user_id = auth.uid()
  )
);

create policy sets_update_own on public.sets
for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.workout_exercises we
    where we.id = sets.workout_exercise_id
      and we.workout_id = sets.workout_id
      and we.user_id = auth.uid()
  )
);

-- profiles: Update nur auf die dafür vorgesehene Spalte ---------------------------------------
-- (Das Profil legt der Trigger handle_new_user an; er läuft mit den Rechten des
-- Eigentümers und ist davon nicht betroffen. Die App liest und ändert profiles bisher nicht.)
-- Spätere Spalten wie username bekommen ihr "grant update (...)" in der jeweiligen Migration.

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

commit;
