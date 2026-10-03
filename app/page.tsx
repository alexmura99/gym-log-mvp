"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import AuthForm from "@/components/AuthForm";
import ExerciseManager from "@/components/ExerciseManager";
import SafeAreaTop from "@/components/SafeAreaTop";
import BackfillWorkout from "@/components/BackfillWorkout";
import LiveWorkout from "@/components/LiveWorkout";
import WeeklyPlanner from "@/components/WeeklyPlanner";
import WorkoutHistory from "@/components/WorkoutHistory";
import {
  OFFLINE_TEXT_AUTH,
  OFFLINE_TEXT_LOAD,
  OFFLINE_TEXT_SAVE_WORKOUT,
  describeError,
} from "@/lib/errors";
import { formatDateGermanShort, toLocalIsoDate } from "@/lib/dates";
import { fetchAll } from "@/lib/fetchAll";
import { getWorkoutRecommendation } from "@/lib/recommendations";
import { APP_TABS, WEEKDAY_OPTIONS } from "@/types/workout";
import type { User } from "@supabase/supabase-js";
import type {
  AppTab,
  Exercise,
  PlannerDay,
  RecommendationSet,
  Workout,
  WorkoutExercise,
  WorkoutSaveInput,
  WorkoutSet,
} from "@/types/workout";

function sortPlannerDays(days: PlannerDay[]) {
  return [...days].sort((left, right) => left.position - right.position);
}

function buildFallbackPlannerDay(userId: string, dayOfWeek: number, index: number): PlannerDay {
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    day_of_week: dayOfWeek,
    title: "Ruhetag",
    is_rest_day: true,
    position: index,
    notes: null,
    planned_exercise_ids: [],
  };
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("plan");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [plannerDays, setPlannerDays] = useState<PlannerDay[]>([]);
  const [history, setHistory] = useState<Workout[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [profileView, setProfileView] = useState<"main" | "exercises">("main");
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [savingPlannerDayId, setSavingPlannerDayId] = useState<string | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const loadedUserIdRef = useRef<string | null>(null);
  const isMovingPlannerDayRef = useRef(false);

  // Ein gemeinsamer Hinweis in der Seite statt eines Alerts pro Abfrage.
  function reportLoadError(error: { message: string }) {
    setLoadNotice(describeError(error, OFFLINE_TEXT_LOAD));
  }

  // Meldet true, wenn Übungen, Plan und Historie vollständig geladen wurden.
  async function loadDashboard(
    userId: string,
    options: { skipOnlineCheck?: boolean } = {}
  ): Promise<boolean> {
    // Ohne Netz sofort melden, statt auf die Wiederholungen der Bibliothek (ca. 7 s) zu warten.
    if (!options.skipOnlineCheck && navigator.onLine === false) {
      setLoadNotice(OFFLINE_TEXT_LOAD);
      return false;
    }

    setPageLoading(true);
    setLoadNotice(null);

    try {
      const loadedExercises = await loadExercises(userId);

      if (!loadedExercises) {
        return false;
      }

      const results = await Promise.all([
        loadPlanner(userId),
        loadHistory(userId, loadedExercises),
      ]);
      return results.every(Boolean);
    } catch (error) {
      console.error(error);
      reportLoadError(error instanceof Error ? error : { message: "Unbekannter Fehler" });
      return false;
    } finally {
      setPageLoading(false);
    }
  }

  async function loadExercises(userId: string): Promise<Exercise[] | null> {
    const { data, error } = await supabase
      .from("exercises")
      .select("id,user_id,name,muscle_group,is_public,created_at")
      .or(`is_public.eq.true,user_id.eq.${userId}`)
      .order("name", { ascending: true });

    if (error) {
      reportLoadError(error);
      return null;
    }

    const rows = (data ?? []) as Exercise[];
    setExercises(rows);
    return rows;
  }

  async function loadPlanner(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("weekly_plan_days")
      .select("id,user_id,day_of_week,title,is_rest_day,position,notes,planned_exercise_ids,created_at")
      .eq("user_id", userId)
      .order("position", { ascending: true });

    if (error) {
      reportLoadError(error);
      return false;
    }

    const existingDays = ((data ?? []) as PlannerDay[]).sort(
      (left, right) => left.position - right.position
    );

    const uniqueDayMap = new Map<number, PlannerDay>();
    const duplicateIds: string[] = [];

    for (const day of existingDays) {
      if (!uniqueDayMap.has(day.day_of_week)) {
        uniqueDayMap.set(day.day_of_week, day);
      } else {
        duplicateIds.push(day.id);
      }
    }

    if (duplicateIds.length > 0) {
      await supabase
        .from("weekly_plan_days")
        .delete()
        .in("id", duplicateIds)
        .eq("user_id", userId);
    }

    const missingDays = WEEKDAY_OPTIONS.filter(
      (weekday) => !uniqueDayMap.has(weekday.key)
    ).map((weekday, index) => ({
      user_id: userId,
      day_of_week: weekday.key,
      title: "Ruhetag",
      is_rest_day: true,
      position: uniqueDayMap.size + index,
      notes: null,
      planned_exercise_ids: [],
    }));

    let insertedDays: PlannerDay[] = [];

    if (missingDays.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("weekly_plan_days")
        .insert(missingDays)
        .select("id,user_id,day_of_week,title,is_rest_day,position,notes,planned_exercise_ids,created_at");

      if (!insertError) {
        insertedDays = (inserted ?? []) as PlannerDay[];
      }
    }

    const mergedByDay = new Map<number, PlannerDay>(uniqueDayMap);
    for (const day of insertedDays) {
      mergedByDay.set(day.day_of_week, day);
    }

    const normalizedDays = WEEKDAY_OPTIONS.map((weekday, index) => {
      const existingDay = mergedByDay.get(weekday.key);
      if (!existingDay) {
        return buildFallbackPlannerDay(userId, weekday.key, index);
      }

      return {
        ...existingDay,
        day_of_week: weekday.key,
        position: index,
        planned_exercise_ids: existingDay.planned_exercise_ids ?? [],
      };
    });

    setPlannerDays(normalizedDays);

    await supabase.from("weekly_plan_days").upsert(
      normalizedDays.map((day) => ({
        id: day.id,
        user_id: day.user_id,
        day_of_week: day.day_of_week,
        title: day.title,
        is_rest_day: day.is_rest_day,
        position: day.position,
        notes: day.notes,
        planned_exercise_ids: day.planned_exercise_ids,
      }))
    );

    return true;
  }

  async function loadHistory(userId: string, exerciseRows: Exercise[]): Promise<boolean> {
    const { data: workouts, error: workoutsError } = await fetchAll<Workout>((from, to) =>
      supabase
        .from("workouts")
        .select("id,user_id,date,title,notes,created_at")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    );

    if (workoutsError) {
      reportLoadError(workoutsError);
      return false;
    }

    const { data: workoutExercises, error: workoutExercisesError } =
      await fetchAll<WorkoutExercise>((from, to) =>
        supabase
          .from("workout_exercises")
          .select("id,user_id,workout_id,exercise_id,note")
          .eq("user_id", userId)
          .order("workout_id", { ascending: true })
          .order("position", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      );

    if (workoutExercisesError) {
      reportLoadError(workoutExercisesError);
      return false;
    }

    const { data: sets, error: setsError } = await fetchAll<WorkoutSet>((from, to) =>
      supabase
        .from("sets")
        .select("id,user_id,workout_id,workout_exercise_id,set_number,weight,reps,rpe,created_at")
        .eq("user_id", userId)
        .order("workout_id", { ascending: true })
        .order("workout_exercise_id", { ascending: true })
        .order("set_number", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    );

    if (setsError) {
      reportLoadError(setsError);
      return false;
    }

    const exerciseMap = new Map(exerciseRows.map((exercise) => [exercise.id, exercise]));
    const setsByWorkoutExercise = new Map<string, WorkoutSet[]>();

    sets.forEach((set) => {
      const currentSets = setsByWorkoutExercise.get(set.workout_exercise_id ?? "") ?? [];
      currentSets.push(set);
      setsByWorkoutExercise.set(set.workout_exercise_id ?? "", currentSets);
    });

    const workoutExercisesByWorkout = new Map<string, WorkoutExercise[]>();

    workoutExercises.forEach((exerciseRow) => {
      const currentExercises = workoutExercisesByWorkout.get(exerciseRow.workout_id ?? "") ?? [];
      currentExercises.push({
        ...exerciseRow,
        exercise: exerciseMap.get(exerciseRow.exercise_id) ?? null,
        sets: setsByWorkoutExercise.get(exerciseRow.id ?? "") ?? [],
      });
      workoutExercisesByWorkout.set(exerciseRow.workout_id ?? "", currentExercises);
    });

    const merged = workouts.map((workout) => ({
      ...workout,
      workout_exercises: workoutExercisesByWorkout.get(workout.id) ?? [],
    }));

    setHistory(merged);
    return true;
  }

  async function signUp() {
    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        alert(describeError(error, OFFLINE_TEXT_AUTH));
        return;
      }

      alert("Registrierung erfolgreich. Prüfe ggf. deine E-Mails.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function login() {
    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert(describeError(error, OFFLINE_TEXT_AUTH));
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setHistory([]);
    setExercises([]);
    setPlannerDays([]);
    setLoadNotice(null);
    setProfileView("main");
    setActiveTab("plan");
    setEditingWorkout(null);
  }

  function normalizeExerciseName(name: string) {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
  }

  // Gleicher Name (ohne Groß-/Kleinschreibung und Mehrfach-Leerzeichen) wie eine sichtbare
  // Übung, Standardübungen eingeschlossen.
  function findExerciseNameConflict(name: string, ignoreId?: string) {
    const key = normalizeExerciseName(name);
    return exercises.find(
      (exercise) => exercise.id !== ignoreId && normalizeExerciseName(exercise.name) === key
    );
  }

  async function createExercise(payload: { name: string; muscleGroup: string }) {
    if (!user) {
      return null;
    }

    const conflict = findExerciseNameConflict(payload.name);

    if (conflict) {
      alert(`Eine Übung mit dem Namen „${conflict.name}“ gibt es schon.`);
      return null;
    }

    const { data, error } = await supabase
      .from("exercises")
      .insert({
        user_id: user.id,
        name: payload.name.trim(),
        muscle_group: payload.muscleGroup,
        is_public: false,
      })
      .select("id,user_id,name,muscle_group,is_public,created_at")
      .single();

    if (error) {
      alert(describeError(error));
      return null;
    }

    const created = data as Exercise;
    const nextExercises = [...exercises, created].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    setExercises(nextExercises);
    return created;
  }

  async function updateExercise(
    exerciseId: string,
    payload: { name: string; muscleGroup: string }
  ) {
    if (!user) {
      return false;
    }

    const conflict = findExerciseNameConflict(payload.name, exerciseId);

    if (conflict) {
      alert(`Eine Übung mit dem Namen „${conflict.name}“ gibt es schon.`);
      return false;
    }

    const { data, error } = await supabase
      .from("exercises")
      .update({ name: payload.name.trim(), muscle_group: payload.muscleGroup })
      .eq("id", exerciseId)
      .eq("user_id", user.id)
      .eq("is_public", false)
      .select("id,user_id,name,muscle_group,is_public,created_at");

    if (error) {
      alert(describeError(error));
      return false;
    }

    const updated = (data?.[0] ?? null) as Exercise | null;

    if (!updated) {
      alert("Die Übung konnte nicht geändert werden.");
      return false;
    }

    setExercises((current) =>
      current
        .map((exercise) => (exercise.id === updated.id ? updated : exercise))
        .sort((left, right) => left.name.localeCompare(right.name))
    );
    // Die Historie trägt das Übungs-Objekt mit, ohne neu zu laden den neuen Namen übernehmen.
    setHistory((current) =>
      current.map((workout) => ({
        ...workout,
        workout_exercises: workout.workout_exercises.map((row) =>
          row.exercise_id === updated.id ? { ...row, exercise: updated } : row
        ),
      }))
    );
    return true;
  }

  async function deleteExercise(exerciseId: string) {
    if (!user) {
      return false;
    }

    // Die Datenbank sperrt das Löschen, solange die Übung in einem Workout vorkommt
    // (Fremdschlüssel on delete restrict, Fehlercode 23503).
    const { data, error } = await supabase
      .from("exercises")
      .delete()
      .eq("id", exerciseId)
      .eq("user_id", user.id)
      .eq("is_public", false)
      .select("id");

    if (error) {
      alert(
        error.code === "23503"
          ? "Diese Übung wird in Workouts verwendet und kann nicht gelöscht werden."
          : describeError(error)
      );
      return false;
    }

    if (!data || data.length === 0) {
      alert("Die Übung konnte nicht gelöscht werden.");
      return false;
    }

    setExercises((current) => current.filter((exercise) => exercise.id !== exerciseId));

    // Erst nach erfolgreichem Löschen aus dem Wochenplan entfernen (ein Upsert, atomar).
    const affectedDays = plannerDays
      .filter((day) => (day.planned_exercise_ids ?? []).includes(exerciseId))
      .map((day) => ({
        ...day,
        planned_exercise_ids: day.planned_exercise_ids.filter((id) => id !== exerciseId),
      }));

    if (affectedDays.length > 0) {
      setPlannerDays((current) =>
        current.map((day) => affectedDays.find((row) => row.id === day.id) ?? day)
      );

      const { error: planError } = await supabase.from("weekly_plan_days").upsert(
        affectedDays.map((day) => ({
          id: day.id,
          user_id: day.user_id,
          day_of_week: day.day_of_week,
          title: day.title,
          is_rest_day: day.is_rest_day,
          position: day.position,
          notes: day.notes,
          planned_exercise_ids: day.planned_exercise_ids,
        }))
      );

      if (planError) {
        alert(
          "Die Übung wurde gelöscht, konnte aber nicht aus dem Wochenplan entfernt werden. " +
            "Das ist unsichtbar und harmlos, ein erneutes Speichern des Tages räumt es auf."
        );
      }
    }

    return true;
  }

  // Anzahl der Workouts je Übung (ein Workout zählt einmal, auch bei mehreren Blöcken).
  function getExerciseUsage() {
    const usage = new Map<string, number>();

    for (const workout of history) {
      const seen = new Set(workout.workout_exercises.map((row) => row.exercise_id));
      seen.forEach((exerciseId) => usage.set(exerciseId, (usage.get(exerciseId) ?? 0) + 1));
    }

    return usage;
  }

  // Die Historie ist nach Datum absteigend sortiert: die ersten zwei Einheiten mit Sätzen
  // dieser Übung sind die letzten beiden (alle Blöcke der Übung in einem Workout zählen zusammen).
  function getLatestPerformance(exerciseId: string) {
    const sessions: RecommendationSet[][] = [];
    let lastSessionDate: string | null = null;

    for (const workout of history) {
      const sets = workout.workout_exercises
        .filter((row) => row.exercise_id === exerciseId)
        .flatMap((row) => row.sets)
        .map((set) => ({ weight: set.weight, reps: set.reps, rpe: set.rpe }));

      if (sets.length > 0) {
        if (sessions.length === 0) {
          lastSessionDate = workout.date;
        }

        sessions.push(sets);
      }

      if (sessions.length === 2) {
        break;
      }
    }

    return getWorkoutRecommendation({ sessions, lastSessionDate });
  }

  async function saveWorkout(payload: WorkoutSaveInput): Promise<boolean> {
    if (!user) {
      return false;
    }

    // Eine Datenbankfunktion erledigt alles in einer Transaktion (inkl. Snapshot in
    // workout_versions beim Ersetzen). Siehe supabase/migrations/001_save_workout.sql.
    const { error } = await supabase.rpc("save_workout", {
      payload: {
        id: payload.id,
        date: payload.date,
        title: payload.title,
        notes: payload.notes,
        exercises: payload.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          note: exercise.note,
          sets: exercise.sets.map((set) => ({
            weight: Number(set.weight),
            reps: Number(set.reps),
            rpe: set.rpe ? Number(set.rpe) : null,
          })),
        })),
      },
    });

    if (error) {
      alert(describeError(error, OFFLINE_TEXT_SAVE_WORKOUT));
      return false;
    }

    setEditingWorkout(null);
    const loadedExercises = (await loadExercises(user.id)) ?? exercises;
    await loadHistory(user.id, loadedExercises);
    setActiveTab("history");
    return true;
  }

  async function deleteWorkout(workoutId: string) {
    if (!user) {
      return;
    }

    // Sätze und Übungen hängen per on delete cascade am Workout: ein DELETE reicht und ist atomar.
    const { error } = await supabase
      .from("workouts")
      .delete()
      .eq("id", workoutId)
      .eq("user_id", user.id);

    if (error) {
      alert(describeError(error));
      return;
    }

    const loadedExercises = (await loadExercises(user.id)) ?? exercises;
    await loadHistory(user.id, loadedExercises);
  }

  async function savePlannerDay(dayId: string, updates: Partial<PlannerDay>) {
    if (!user) {
      return;
    }

    setSavingPlannerDayId(dayId);

    try {
      const { error } = await supabase
        .from("weekly_plan_days")
        .update(updates)
        .eq("id", dayId)
        .eq("user_id", user.id);

      if (error) {
        alert(describeError(error));
        return;
      }

      setPlannerDays((current) =>
        current.map((day) => (day.id === dayId ? { ...day, ...updates } : day))
      );
    } finally {
      setSavingPlannerDayId(null);
    }
  }

  async function deletePlannerDay(dayId: string) {
    await savePlannerDay(dayId, {
      title: "Ruhetag",
      notes: null,
      is_rest_day: true,
      planned_exercise_ids: [],
    });
  }

  // Tauscht nur den Inhalt (Titel, Ruhetag, Notizen, geplante Übungen) zweier Tage. Jede Zeile
  // behält ihren Wochentag und ihre Position, so bleibt der Unique-Index
  // (user_id, day_of_week) unberührt.
  async function movePlannerDay(fromId: string, toId: string) {
    if (!user || isMovingPlannerDayRef.current) {
      return;
    }

    const currentDays = sortPlannerDays(plannerDays);
    const first = currentDays.find((day) => day.id === fromId);
    const second = currentDays.find((day) => day.id === toId);

    if (!first || !second || first.id === second.id) {
      return;
    }

    const contentOf = (day: PlannerDay) => ({
      title: day.title,
      is_rest_day: day.is_rest_day,
      notes: day.notes,
      planned_exercise_ids: day.planned_exercise_ids,
    });

    const changedRows = [
      { ...first, ...contentOf(second) },
      { ...second, ...contentOf(first) },
    ];

    setPlannerDays(
      currentDays.map((day) => changedRows.find((row) => row.id === day.id) ?? day)
    );

    isMovingPlannerDayRef.current = true;

    try {
      const { error } = await supabase.from("weekly_plan_days").upsert(
        changedRows.map((day) => ({
          id: day.id,
          user_id: day.user_id,
          day_of_week: day.day_of_week,
          title: day.title,
          is_rest_day: day.is_rest_day,
          position: day.position,
          notes: day.notes,
          planned_exercise_ids: day.planned_exercise_ids,
        }))
      );

      if (error) {
        alert(describeError(error));
        await loadPlanner(user.id);
      }
    } finally {
      isMovingPlannerDayRef.current = false;
    }
  }

  function getTodaysPlannedDay() {
    return plannerDays.find((day) => day.day_of_week === new Date().getDay());
  }

  // Titelvorschlag im Live-Tab.
  function getTodaysPlanTitle() {
    const plannedDay = getTodaysPlannedDay();

    if (!plannedDay || plannedDay.is_rest_day) {
      return "Freies Workout";
    }

    return plannedDay.title;
  }

  // Anzeige im Profil: an Ruhetagen "Ruhetag", solange der Plan noch fehlt "–".
  function getTodaysPlanLabel() {
    const plannedDay = getTodaysPlannedDay();

    if (!plannedDay) {
      return "–";
    }

    return plannedDay.is_rest_day ? "Ruhetag" : plannedDay.title;
  }

  function getTodaysPlannedExerciseIds() {
    const plannedDay = getTodaysPlannedDay();
    return plannedDay && !plannedDay.is_rest_day ? (plannedDay.planned_exercise_ids ?? []) : [];
  }

  // force: erzwingt die Abfragen (Button "Erneut versuchen"), auch wenn der Browser "offline"
  // meldet oder das Dashboard schon als geladen gilt.
  async function ensureDashboardLoaded(userId: string, options: { force?: boolean } = {}) {
    // Token-Refresh und Tab-Rückkehr melden denselben Nutzer erneut: dann nicht neu laden.
    if (!options.force && loadedUserIdRef.current === userId) {
      return;
    }

    loadedUserIdRef.current = userId;
    const loaded = await loadDashboard(userId, { skipOnlineCheck: options.force });

    // Nur ein erfolgreiches Laden merken, sonst versucht es der nächste Anlass erneut.
    if (!loaded && loadedUserIdRef.current === userId) {
      loadedUserIdRef.current = null;
    }
  }

  const syncDashboard = useEffectEvent(async (nextUser: User | null) => {
    if (nextUser) {
      await ensureDashboardLoaded(nextUser.id);
      return;
    }

    loadedUserIdRef.current = null;
    setLoadNotice(null);
    setExercises([]);
    setPlannerDays([]);
    setHistory([]);
    setEditingWorkout(null);
    setActiveTab("plan");
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    const currentUser = user;

    function handleOnline() {
      void syncDashboard(currentUser);
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    // Fallback, falls die lokale Sitzung auf eine hängende Anfrage wartet (schlechter Empfang).
    const readyFallback = setTimeout(() => {
      if (isMounted) {
        setAuthReady(true);
      }
    }, 8000);

    // INITIAL_SESSION kommt aus der lokal gespeicherten Sitzung, ohne eigene Serveranfrage.
    // Der Callback läuft im Auth-Lock von supabase-js. Supabase-Aufrufe dürfen deshalb
    // nicht darin abgewartet werden (Deadlock), sondern erst danach per setTimeout.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setAuthReady(true);
      setTimeout(() => void syncDashboard(nextUser), 0);
    });

    return () => {
      isMounted = false;
      clearTimeout(readyFallback);
      listener.subscription.unsubscribe();
    };
  }, []);

  function renderActiveTab() {
    const ownExerciseCount = exercises.filter(
      (exercise) => !exercise.is_public && exercise.user_id === user?.id
    ).length;

    switch (activeTab) {
      case "plan":
        return (
          <WeeklyPlanner
            days={plannerDays}
            exercises={exercises}
            onSaveDay={savePlannerDay}
            onDeleteDay={deletePlannerDay}
            onMoveDay={movePlannerDay}
            savingDayId={savingPlannerDayId}
          />
        );
      case "live":
        return (
          <LiveWorkout
            userId={user?.id ?? ""}
            exercises={exercises}
            suggestedTitle={getTodaysPlanTitle()}
            plannedExerciseIds={getTodaysPlannedExerciseIds()}
            loading={pageLoading}
            onSave={saveWorkout}
            onCreateExercise={createExercise}
            getRecommendation={getLatestPerformance}
          />
        );
      case "backfill":
        return (
          <BackfillWorkout
            exercises={exercises}
            editingWorkout={editingWorkout}
            onSave={saveWorkout}
            onCancelEdit={() => setEditingWorkout(null)}
            onCreateExercise={createExercise}
            getRecommendation={getLatestPerformance}
          />
        );
      case "history":
        return (
          <WorkoutHistory
            history={history}
            onEdit={(workout) => {
              setEditingWorkout(workout);
              setActiveTab("backfill");
            }}
            onDelete={deleteWorkout}
          />
        );
      case "profile":
        if (profileView === "exercises") {
          return (
            <ExerciseManager
              exercises={exercises}
              currentUserId={user?.id ?? ""}
              usage={getExerciseUsage()}
              findNameConflict={findExerciseNameConflict}
              onCreate={createExercise}
              onUpdate={updateExercise}
              onDelete={deleteExercise}
              onBack={() => setProfileView("main")}
            />
          );
        }

        return (
          <section className="space-y-4 rounded-4xl border border-white/80 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                Profil
              </p>
              <h2 className="text-2xl font-black text-zinc-950">Dein Konto</h2>
            </div>

            <div className="rounded-3xl bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                E-Mail
              </p>
              <p className="mt-1 text-lg font-bold text-zinc-950">{user?.email}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-3xl bg-zinc-50 p-4">
                <p className="text-xs text-zinc-500">Workouts</p>
                <p className="text-2xl font-black text-zinc-950">{history.length}</p>
              </div>
              <div className="rounded-3xl bg-zinc-50 p-4">
                <p className="text-xs text-zinc-500">Übungen</p>
                <p className="text-2xl font-black text-zinc-950">{exercises.length}</p>
              </div>
              <div className="rounded-3xl bg-zinc-50 p-4">
                <p className="text-xs text-zinc-500">Heute</p>
                <p className="text-sm font-bold text-zinc-950">{getTodaysPlanLabel()}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setProfileView("exercises")}
              className="flex w-full items-center justify-between gap-3 rounded-3xl bg-zinc-50 p-4 text-left"
            >
              <span>
                <span className="block text-sm font-bold text-zinc-950">Übungen verwalten</span>
                <span className="block text-xs text-zinc-500">
                  {ownExerciseCount === 1 ? "1 eigene Übung" : `${ownExerciseCount} eigene Übungen`}
                </span>
              </span>
              <span aria-hidden="true" className="text-xl text-zinc-400">
                ›
              </span>
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full rounded-2xl bg-zinc-950 px-4 py-4 text-sm font-semibold text-white"
            >
              Logout
            </button>
          </section>
        );
      default:
        return null;
    }
  }

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fef3c7,#f8fafc_55%)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-zinc-950">
        <SafeAreaTop color="#fef3c7" />
        <p className="text-sm font-semibold text-zinc-600">Lade...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthForm
        authMode={authMode}
        setAuthMode={setAuthMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        login={login}
        signUp={signUp}
        loading={authLoading}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#f8fafc_24%,#eef2ff_100%)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(1.5rem_+_env(safe-area-inset-top))] pb-[calc(7rem_+_env(safe-area-inset-bottom))] text-zinc-950">
      <SafeAreaTop color="#fff7ed" />
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <header className="space-y-4 rounded-4xl border border-white/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Personal Strength Log
            </p>
            <div className="flex items-center justify-between gap-3">
              <h1 className="min-w-0 text-3xl font-black tracking-tight">Gym Log</h1>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
                {pageLoading ? "Sync..." : formatDateGermanShort(toLocalIsoDate())}
              </span>
            </div>
          </div>

          <div className="rounded-3xl bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-900">Eingeloggt als {user.email}</p>
            <p className="mt-1 text-sm text-zinc-500">
              Plane die Woche, tracke live im Gym und nutze alte Leistungen für die nächste Lastentscheidung.
            </p>
          </div>
        </header>

        {loadNotice && (
          <div className="flex items-center justify-between gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{loadNotice}</p>
            <button
              type="button"
              onClick={() => void ensureDashboardLoaded(user.id, { force: true })}
              disabled={pageLoading}
              className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-semibold text-zinc-900 disabled:opacity-60"
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {renderActiveTab()}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-200 bg-white/95 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {APP_TABS.map((tab) => {
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setProfileView("main");
                }}
                className={`min-w-0 truncate rounded-2xl px-0.5 py-3 text-[0.6875rem]! font-semibold! transition ${
                  isActive ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}