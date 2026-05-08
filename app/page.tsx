"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import AuthForm from "@/components/AuthForm";
import BackfillWorkout from "@/components/BackfillWorkout";
import LiveWorkout from "@/components/LiveWorkout";
import WeeklyPlanner from "@/components/WeeklyPlanner";
import WorkoutHistory from "@/components/WorkoutHistory";
import { getWorkoutRecommendation } from "@/lib/recommendations";
import { APP_TABS, WEEKDAY_OPTIONS } from "@/types/workout";
import type { User } from "@supabase/supabase-js";
import type {
  AppTab,
  Exercise,
  PlannerDay,
  Workout,
  WorkoutExercise,
  WorkoutSaveInput,
  WorkoutSet,
} from "@/types/workout";

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

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
  const [pageLoading, setPageLoading] = useState(false);
  const [savingPlannerDayId, setSavingPlannerDayId] = useState<string | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);

  async function loadDashboard(userId: string) {
    setPageLoading(true);

    try {
      const loadedExercises = await loadExercises(userId);
      await Promise.all([loadPlanner(userId), loadHistory(userId, loadedExercises)]);
    } finally {
      setPageLoading(false);
    }
  }

  async function loadExercises(userId: string) {
    const { data, error } = await supabase
      .from("exercises")
      .select("id,user_id,name,muscle_group,is_public,created_at")
      .or(`is_public.eq.true,user_id.eq.${userId}`)
      .order("name", { ascending: true });

    if (error) {
      alert(error.message);
      return [] as Exercise[];
    }

    const rows = (data ?? []) as Exercise[];
    setExercises(rows);
    return rows;
  }

  async function loadPlanner(userId: string) {
    const { data, error } = await supabase
      .from("weekly_plan_days")
      .select("id,user_id,day_of_week,title,is_rest_day,position,notes,planned_exercise_ids,created_at")
      .eq("user_id", userId)
      .order("position", { ascending: true });

    if (error) {
      alert(error.message);
      return;
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
  }

  async function loadHistory(userId: string, exerciseRows: Exercise[]) {
    const { data: workouts, error: workoutsError } = await supabase
      .from("workouts")
      .select("id,user_id,date,title,notes,created_at")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (workoutsError) {
      alert(workoutsError.message);
      return;
    }

    const { data: workoutExercises, error: workoutExercisesError } = await supabase
      .from("workout_exercises")
      .select("id,user_id,workout_id,exercise_id,note")
      .eq("user_id", userId);

    if (workoutExercisesError) {
      alert(workoutExercisesError.message);
      return;
    }

    const { data: sets, error: setsError } = await supabase
      .from("sets")
      .select("id,user_id,workout_id,workout_exercise_id,set_number,weight,reps,rpe,created_at")
      .eq("user_id", userId)
      .order("set_number", { ascending: true });

    if (setsError) {
      alert(setsError.message);
      return;
    }

    const exerciseMap = new Map(exerciseRows.map((exercise) => [exercise.id, exercise]));
    const setsByWorkoutExercise = new Map<string, WorkoutSet[]>();

    ((sets ?? []) as WorkoutSet[]).forEach((set) => {
      const currentSets = setsByWorkoutExercise.get(set.workout_exercise_id ?? "") ?? [];
      currentSets.push(set);
      setsByWorkoutExercise.set(set.workout_exercise_id ?? "", currentSets);
    });

    const workoutExercisesByWorkout = new Map<string, WorkoutExercise[]>();

    ((workoutExercises ?? []) as WorkoutExercise[]).forEach((exerciseRow) => {
      const currentExercises = workoutExercisesByWorkout.get(exerciseRow.workout_id ?? "") ?? [];
      currentExercises.push({
        ...exerciseRow,
        exercise: exerciseMap.get(exerciseRow.exercise_id) ?? null,
        sets: setsByWorkoutExercise.get(exerciseRow.id ?? "") ?? [],
      });
      workoutExercisesByWorkout.set(exerciseRow.workout_id ?? "", currentExercises);
    });

    const merged = ((workouts ?? []) as Workout[]).map((workout) => ({
      ...workout,
      workout_exercises: workoutExercisesByWorkout.get(workout.id) ?? [],
    }));

    setHistory(merged);
  }

  async function signUp() {
    setAuthLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        alert(error.message);
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
        alert(error.message);
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
    setActiveTab("plan");
    setEditingWorkout(null);
  }

  async function createExercise(payload: { name: string; muscleGroup: string }) {
    if (!user) {
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
      alert(error.message);
      return null;
    }

    const created = data as Exercise;
    const nextExercises = [...exercises, created].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    setExercises(nextExercises);
    return created;
  }

  function getLatestPerformance(exerciseId: string) {
    for (const workout of history) {
      const match = workout.workout_exercises.find(
        (exercise) => exercise.exercise_id === exerciseId && exercise.sets.length > 0
      );

      if (match?.exercise) {
        return getWorkoutRecommendation({
          exerciseName: match.exercise.name,
          latestPerformance: match.sets.map((set) => ({
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
          })),
        });
      }
    }

    return null;
  }

  async function archiveWorkoutVersion(workoutId: string, userId: string) {
    const { data: workoutRow, error: workoutError } = await supabase
      .from("workouts")
      .select("id,user_id,date,title,notes,created_at")
      .eq("id", workoutId)
      .eq("user_id", userId)
      .maybeSingle();

    if (workoutError || !workoutRow) {
      return;
    }

    const { data: versionRows } = await supabase
      .from("workout_versions")
      .select("version_number")
      .eq("workout_id", workoutId)
      .eq("user_id", userId)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersion = ((versionRows?.[0]?.version_number as number | undefined) ?? 0) + 1;

    const { data: exerciseRows } = await supabase
      .from("workout_exercises")
      .select("id,user_id,workout_id,exercise_id,note,position,created_at")
      .eq("workout_id", workoutId)
      .eq("user_id", userId)
      .order("position", { ascending: true });

    const exerciseIds = (exerciseRows ?? []).map((row) => row.id as string);

    type ArchivedSetRow = {
      id: string;
      user_id: string;
      workout_id: string;
      workout_exercise_id: string;
      set_number: number;
      weight: number;
      reps: number;
      rpe: number | null;
      created_at: string;
    };

    let setRows: ArchivedSetRow[] = [];

    if (exerciseIds.length > 0) {
      const { data } = await supabase
        .from("sets")
        .select("id,user_id,workout_id,workout_exercise_id,set_number,weight,reps,rpe,created_at")
        .in("workout_exercise_id", exerciseIds)
        .eq("user_id", userId)
        .order("set_number", { ascending: true });
      setRows = (data ?? []) as ArchivedSetRow[];
    }

    const snapshot = {
      workout: workoutRow,
      workout_exercises: exerciseRows ?? [],
      sets: setRows,
      archived_at: new Date().toISOString(),
    };

    await supabase.from("workout_versions").insert({
      user_id: userId,
      workout_id: workoutId,
      version_number: nextVersion,
      reason: "update",
      snapshot,
    });
  }

  async function saveWorkout(payload: WorkoutSaveInput) {
    if (!user) {
      return;
    }

    let workoutId = payload.id;

    if (workoutId) {
      await archiveWorkoutVersion(workoutId, user.id);

      const { error: updateError } = await supabase
        .from("workouts")
        .update({
          date: payload.date,
          title: payload.title,
          notes: payload.notes || null,
        })
        .eq("id", workoutId)
        .eq("user_id", user.id);

      if (updateError) {
        alert(updateError.message);
        return;
      }

      const { error: deleteSetsError } = await supabase
        .from("sets")
        .delete()
        .eq("workout_id", workoutId)
        .eq("user_id", user.id);

      if (deleteSetsError) {
        alert(deleteSetsError.message);
        return;
      }

      const { error: deleteWorkoutExercisesError } = await supabase
        .from("workout_exercises")
        .delete()
        .eq("workout_id", workoutId)
        .eq("user_id", user.id);

      if (deleteWorkoutExercisesError) {
        alert(deleteWorkoutExercisesError.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          date: payload.date,
          title: payload.title,
          notes: payload.notes || null,
        })
        .select("id")
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      workoutId = data.id as string;
    }

    const workoutExerciseRows = payload.exercises.map((exercise, index) => ({
      user_id: user.id,
      workout_id: workoutId,
      exercise_id: exercise.exerciseId,
      note: exercise.note || null,
      position: index,
    }));

    const { data: insertedWorkoutExercises, error: workoutExercisesError } = await supabase
      .from("workout_exercises")
      .insert(workoutExerciseRows)
      .select("id,exercise_id");

    if (workoutExercisesError) {
      alert(workoutExercisesError.message);
      return;
    }

    const insertedExerciseMap = new Map(
      (insertedWorkoutExercises ?? []).map((row) => [row.exercise_id as string, row.id as string])
    );

    const setRows = payload.exercises.flatMap((exercise) =>
      exercise.sets.map((set, index) => ({
        user_id: user.id,
        workout_id: workoutId,
        workout_exercise_id: insertedExerciseMap.get(exercise.exerciseId),
        set_number: index + 1,
        weight: Number(set.weight),
        reps: Number(set.reps),
        rpe: set.rpe ? Number(set.rpe) : null,
      }))
    );

    const { error: setsError } = await supabase.from("sets").insert(setRows);

    if (setsError) {
      alert(setsError.message);
      return;
    }

    setEditingWorkout(null);
    const loadedExercises = await loadExercises(user.id);
    await loadHistory(user.id, loadedExercises);
    setActiveTab("history");
  }

  async function deleteWorkout(workoutId: string) {
    if (!user) {
      return;
    }

    const { error: deleteSetsError } = await supabase
      .from("sets")
      .delete()
      .eq("workout_id", workoutId)
      .eq("user_id", user.id);

    if (deleteSetsError) {
      alert(deleteSetsError.message);
      return;
    }

    const { error: deleteWorkoutExercisesError } = await supabase
      .from("workout_exercises")
      .delete()
      .eq("workout_id", workoutId)
      .eq("user_id", user.id);

    if (deleteWorkoutExercisesError) {
      alert(deleteWorkoutExercisesError.message);
      return;
    }

    const { error: deleteWorkoutError } = await supabase
      .from("workouts")
      .delete()
      .eq("id", workoutId)
      .eq("user_id", user.id);

    if (deleteWorkoutError) {
      alert(deleteWorkoutError.message);
      return;
    }

    const loadedExercises = await loadExercises(user.id);
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
        alert(error.message);
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

  async function movePlannerDay(fromId: string, toId: string) {
    if (!user) {
      return;
    }

    const currentDays = sortPlannerDays(plannerDays);
    const fromIndex = currentDays.findIndex((day) => day.id === fromId);
    const toIndex = currentDays.findIndex((day) => day.id === toId);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const nextDays = [...currentDays];
    const [movedDay] = nextDays.splice(fromIndex, 1);
    nextDays.splice(toIndex, 0, movedDay);

    const payload = nextDays.map((day, index) => ({
      ...day,
      day_of_week: WEEKDAY_OPTIONS[index].key,
      position: index,
    }));

    setPlannerDays(payload);

    const { error } = await supabase
      .from("weekly_plan_days")
      .upsert(
        payload.map((day) => ({
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
      alert(error.message);
      await loadPlanner(user.id);
    }
  }

  function getTodaysPlanTitle() {
    const plannedDay = plannerDays.find((day) => day.day_of_week === new Date().getDay());

    if (!plannedDay || plannedDay.is_rest_day) {
      return "Freies Workout";
    }

    return plannedDay.title;
  }

  const syncDashboard = useEffectEvent(async (nextUser: User | null) => {
    if (nextUser) {
      await loadDashboard(nextUser.id);
      return;
    }

    setExercises([]);
    setPlannerDays([]);
    setHistory([]);
    setEditingWorkout(null);
    setActiveTab("plan");
  });

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted) {
        return;
      }

      setUser(data.user);
      await syncDashboard(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) {
          return;
        }

        const nextUser = session?.user ?? null;
        setUser(nextUser);
        await syncDashboard(nextUser);
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function renderActiveTab() {
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
            exercises={exercises}
            suggestedTitle={getTodaysPlanTitle()}
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
                <p className="text-sm font-bold text-zinc-950">{getTodaysPlanTitle()}</p>
              </div>
            </div>

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
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#f8fafc_24%,#eef2ff_100%)] px-4 pb-28 pt-6 text-zinc-950">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <header className="space-y-4 rounded-4xl border border-white/80 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                Personal Strength Log
              </p>
              <h1 className="text-3xl font-black tracking-tight">Gym Log</h1>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
              {pageLoading ? "Sync..." : todayIsoDate()}
            </span>
          </div>

          <div className="rounded-3xl bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-900">Eingeloggt als {user.email}</p>
            <p className="mt-1 text-sm text-zinc-500">
              Plane die Woche, tracke live im Gym und nutze alte Leistungen für die nächste Lastentscheidung.
            </p>
          </div>
        </header>

        {renderActiveTab()}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-2">
          {APP_TABS.map((tab) => {
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl px-2 py-3 text-xs font-semibold transition ${
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