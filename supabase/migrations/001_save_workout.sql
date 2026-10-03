-- Migration 001: save_workout
--
-- Legt NUR eine neue Funktion an. Es werden keine Tabellen, Spalten, Indizes oder
-- Policies angelegt oder veraendert, und beim Ausfuehren dieser Datei wird kein
-- Datensatz geloescht oder geaendert. Die Datei kann gefahrlos mehrfach ausgefuehrt werden.
--
-- Was die Funktion zur Laufzeit tut (alles in EINER Transaktion, bei einem Fehler
-- wird nichts davon uebernommen):
--   * neues Workout: legt Workout, Uebungen und Saetze an.
--   * vorhandenes Workout (gleiche id, gleicher Nutzer): legt zuerst einen Snapshot in
--     workout_versions an (gleiches Format wie bisher im Client) und ersetzt dann
--     Titel/Datum/Notizen sowie die Uebungen und Saetze DIESES einen Workouts.
--   * Saetze werden ueber die Position in der Uebungsliste zugeordnet, nicht ueber
--     exercise_id. Dieselbe Uebung darf also mehrfach vorkommen.
--
-- Sicherheit: security invoker, d. h. die RLS-Regeln gelten weiter. user_id wird aus
-- auth.uid() gesetzt, nie aus dem Payload.
--
-- Erwartetes Payload:
-- {
--   "id": "<uuid, vom Client einmal pro Workout erzeugt>",
--   "date": "2026-10-03",
--   "title": "Push",
--   "notes": "",
--   "exercises": [
--     { "exerciseId": "<uuid>", "note": "",
--       "sets": [ { "weight": 60, "reps": 8, "rpe": null } ] }
--   ]
-- }

begin;

create or replace function public.save_workout(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_existing public.workouts%rowtype;
  v_next_version integer;
  v_exercise jsonb;
  v_position integer;
  v_set jsonb;
  v_set_number integer;
  v_workout_exercise_id uuid;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Ungültiges Payload' using errcode = '22023';
  end if;

  if btrim(coalesce(payload->>'title', '')) = '' then
    raise exception 'Der Workout-Titel fehlt' using errcode = '22023';
  end if;

  if jsonb_typeof(payload->'exercises') is distinct from 'array'
     or jsonb_array_length(payload->'exercises') = 0 then
    raise exception 'Mindestens eine Übung ist erforderlich' using errcode = '22023';
  end if;

  v_id := coalesce(nullif(payload->>'id', '')::uuid, gen_random_uuid());

  -- for update: serialisiert gleichzeitige Speichervorgaenge desselben Workouts
  select * into v_existing
  from public.workouts
  where id = v_id and user_id = v_uid
  for update;

  if found then
    select coalesce(max(version_number), 0) + 1
    into v_next_version
    from public.workout_versions
    where workout_id = v_id and user_id = v_uid;

    -- Snapshot VOR dem Ersetzen, gleiches Format wie archiveWorkoutVersion im Client
    insert into public.workout_versions (user_id, workout_id, version_number, reason, snapshot)
    values (
      v_uid,
      v_id,
      v_next_version,
      'update',
      jsonb_build_object(
        'workout', jsonb_build_object(
          'id', v_existing.id,
          'user_id', v_existing.user_id,
          'date', v_existing.date,
          'title', v_existing.title,
          'notes', v_existing.notes,
          'created_at', v_existing.created_at
        ),
        'workout_exercises', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', we.id,
              'user_id', we.user_id,
              'workout_id', we.workout_id,
              'exercise_id', we.exercise_id,
              'note', we.note,
              'position', we.position,
              'created_at', we.created_at
            )
            order by we.position, we.id
          )
          from public.workout_exercises we
          where we.workout_id = v_id and we.user_id = v_uid
        ), '[]'::jsonb),
        'sets', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', s.id,
              'user_id', s.user_id,
              'workout_id', s.workout_id,
              'workout_exercise_id', s.workout_exercise_id,
              'set_number', s.set_number,
              'weight', s.weight,
              'reps', s.reps,
              'rpe', s.rpe,
              'created_at', s.created_at
            )
            order by s.set_number, s.id
          )
          from public.sets s
          where s.workout_id = v_id and s.user_id = v_uid
        ), '[]'::jsonb),
        'archived_at', to_char(
          now() at time zone 'utc',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    );

    update public.workouts
    set
      date = (payload->>'date')::date,
      title = btrim(payload->>'title'),
      notes = nullif(payload->>'notes', '')
    where id = v_id and user_id = v_uid;

    -- Nur die Kinder dieses einen Workouts; wird im selben Schritt neu aufgebaut.
    delete from public.sets where workout_id = v_id and user_id = v_uid;
    delete from public.workout_exercises where workout_id = v_id and user_id = v_uid;
  else
    insert into public.workouts (id, user_id, date, title, notes)
    values (
      v_id,
      v_uid,
      (payload->>'date')::date,
      btrim(payload->>'title'),
      nullif(payload->>'notes', '')
    );
  end if;

  for v_exercise, v_position in
    select e.value, (e.ordinality - 1)::integer
    from jsonb_array_elements(payload->'exercises') with ordinality as e(value, ordinality)
    order by e.ordinality
  loop
    insert into public.workout_exercises (user_id, workout_id, exercise_id, note, position)
    values (
      v_uid,
      v_id,
      (v_exercise->>'exerciseId')::uuid,
      nullif(v_exercise->>'note', ''),
      v_position
    )
    returning id into v_workout_exercise_id;

    for v_set, v_set_number in
      select s.value, s.ordinality::integer
      from jsonb_array_elements(coalesce(v_exercise->'sets', '[]'::jsonb))
        with ordinality as s(value, ordinality)
      order by s.ordinality
    loop
      insert into public.sets (
        user_id, workout_id, workout_exercise_id, set_number, weight, reps, rpe
      )
      values (
        v_uid,
        v_id,
        v_workout_exercise_id,
        v_set_number,
        (v_set->>'weight')::numeric,
        (v_set->>'reps')::integer,
        nullif(v_set->>'rpe', '')::numeric
      );
    end loop;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.save_workout(jsonb) from public;
revoke all on function public.save_workout(jsonb) from anon;
grant execute on function public.save_workout(jsonb) to authenticated;

-- Damit die REST-Schnittstelle die neue Funktion sofort kennt.
notify pgrst, 'reload schema';

commit;
