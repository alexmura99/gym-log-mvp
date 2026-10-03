-- Prüfabfragen zu Migration 003 (rls_hardening)
--
-- NUR LESEN. Jede Abfrage einzeln im SQL-Editor ausführen. Nichts davon ändert Daten oder
-- Regeln. Die Tests unter 6 laufen in einer Transaktion mit "rollback" und hinterlassen nichts.
-- Platzhalter in spitzen Klammern (<...>) vorher durch echte UUIDs ersetzen.

-- 1. Ist RLS auf allen Tabellen aktiv? Erwartet: relrowsecurity = true bei jeder Zeile.
select c.relname as tabelle, c.relrowsecurity as rls_aktiv
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 2. Alle Regeln der geänderten Tabellen.
--    Vorher: with_check bei workout_exercises und sets enthält nur "auth.uid() = user_id".
--    Nachher: zusätzlich die exists-Prüfungen (workouts, exercises, workout_exercises).
select tablename, policyname, cmd, roles, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('workout_exercises', 'sets')
  and cmd in ('INSERT', 'UPDATE')
order by tablename, policyname;

-- 3. Welche Spalten von profiles darf "authenticated" ändern?
--    Vorher: alle (display_name, email, created_at, id). Nachher: nur display_name.
select column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type = 'UPDATE'
order by column_name;

-- 4. Rechte der Rolle anon (nicht angemeldet) auf public-Tabellen. Zur Information:
--    Vorhandene Rechte schaden nicht, weil es für anon keine RLS-Regel gibt (sieht nichts).
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
order by table_name, privilege_type;

-- 5. Verstoßen bestehende Zeilen gegen die neuen Regeln? Erwartet: jeweils 0 Zeilen.
--    (Die Regeln gelten nur für künftige Schreibvorgänge, bestehende Zeilen bleiben, wie sie
--    sind. Zeilen in dieser Liste würden nur auffallen, falls sie später geändert werden.)
select 'workout_exercises: Workout gehört jemand anderem' as problem, we.id
from public.workout_exercises we
left join public.workouts w on w.id = we.workout_id
where w.user_id is distinct from we.user_id
union all
select 'workout_exercises: fremde private Übung', we.id
from public.workout_exercises we
join public.exercises e on e.id = we.exercise_id
where not e.is_public and e.user_id is distinct from we.user_id
union all
select 'sets: Übungsblock fehlt, gehört jemand anderem oder liegt in anderem Workout', s.id
from public.sets s
left join public.workout_exercises we on we.id = s.workout_exercise_id
where we.id is null
   or we.user_id is distinct from s.user_id
   or we.workout_id is distinct from s.workout_id;

-- 6. Verhaltenstests als Nutzer (Transaktion mit rollback). Jeden Block einzeln ausführen.
--    Ein "ERROR: new row violates row-level security policy" ist bei 6a bis 6c gewollt.

-- 6a. Eigene Zeile an ein fremdes Workout hängen. Erwartet: Fehler (RLS).
--     <A> = deine UUID, <FREMDES-WORKOUT> = id eines Workouts eines anderen Nutzers.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);
insert into public.workout_exercises (user_id, workout_id, exercise_id, position)
values ('<A>', '<FREMDES-WORKOUT>', (select id from public.exercises where is_public limit 1), 0);
rollback;

-- 6b. Eigene Zeile mit einer privaten Übung eines anderen Nutzers. Erwartet: Fehler (RLS).
--     <EIGENES-WORKOUT> = id eines deiner Workouts, <FREMDE-UEBUNG> = id einer privaten Übung
--     eines anderen Nutzers.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);
insert into public.workout_exercises (user_id, workout_id, exercise_id, position)
values ('<A>', '<EIGENES-WORKOUT>', '<FREMDE-UEBUNG>', 99);
rollback;

-- 6c. Satz an einen fremden Übungsblock hängen. Erwartet: Fehler (RLS).
--     <FREMDER-BLOCK> = id aus workout_exercises eines anderen Nutzers,
--     <FREMDES-WORKOUT> = dessen workout_id.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);
insert into public.sets (user_id, workout_id, workout_exercise_id, set_number, weight, reps)
values ('<A>', '<FREMDES-WORKOUT>', '<FREMDER-BLOCK>', 1, 50, 8);
rollback;

-- 6d. save_workout funktioniert weiter. Legt ein Test-Workout an, zählt Satz und Block und
--     macht alles per rollback rückgängig. Erwartet: ein Ergebnis mit saetze = 1, bloecke = 1.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);
select public.save_workout(jsonb_build_object(
  'id', gen_random_uuid(),
  'date', current_date,
  'title', 'RLS-Test',
  'exercises', jsonb_build_array(jsonb_build_object(
    'exerciseId', (select id from public.exercises where is_public limit 1),
    'sets', jsonb_build_array(jsonb_build_object('weight', 50, 'reps', 8))
  ))
));
select
  (select count(*) from public.workout_exercises we
     join public.workouts w on w.id = we.workout_id where w.title = 'RLS-Test') as bloecke,
  (select count(*) from public.sets s
     join public.workouts w on w.id = s.workout_id where w.title = 'RLS-Test') as saetze;
rollback;

-- 6e. profiles: Änderung der E-Mail-Spalte als Nutzer. Erwartet nach der Migration: Fehler
--     "permission denied for table profiles" (display_name wäre erlaubt).
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<A>","role":"authenticated"}', true);
update public.profiles set email = 'test@example.invalid' where id = '<A>';
rollback;
