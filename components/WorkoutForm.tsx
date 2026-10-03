"use client";

import { useEffect, useRef, useState } from "react";
import ExerciseSelect from "@/components/ExerciseSelect";
import { toLocalIsoDate } from "@/lib/dates";
import {
  clearWorkoutDraft,
  readWorkoutDraft,
  writeWorkoutDraft,
} from "@/lib/workoutDraft";
import type {
  Exercise,
  RecommendationResult,
  Workout,
  WorkoutDraftExercise,
  WorkoutDraftSet,
  WorkoutSaveInput,
} from "@/types/workout";

type WorkoutFormProps = {
  mode: "live" | "backfill";
  exercises: Exercise[];
  initialWorkout?: Workout | null;
  defaultDate: string;
  defaultTitle: string;
  saveLabel: string;
  intro: string;
  draftKey?: string;
  onSave: (payload: WorkoutSaveInput) => Promise<boolean>;
  onCreateExercise: (payload: {
    name: string;
    muscleGroup: string;
  }) => Promise<Exercise | null>;
  getRecommendation: (exerciseId: string) => RecommendationResult | null;
};

function createDraftSet(): WorkoutDraftSet {
  return {
    id: crypto.randomUUID(),
    weight: "",
    reps: "",
    rpe: "",
  };
}

function createDraftExercise(): WorkoutDraftExercise {
  return {
    id: crypto.randomUUID(),
    exerciseId: "",
    exerciseName: "",
    note: "",
    sets: [createDraftSet()],
  };
}

function buildDraftFromWorkout(workout: Workout | null | undefined) {
  if (!workout) {
    return {
      date: toLocalIsoDate(),
      title: "",
      notes: "",
      exercises: [createDraftExercise()],
    };
  }

  return {
    date: workout.date,
    title: workout.title,
    notes: workout.notes ?? "",
    exercises: workout.workout_exercises.map((exercise) => ({
      id: exercise.id ?? crypto.randomUUID(),
      exerciseId: exercise.exercise_id,
      exerciseName: exercise.exercise?.name ?? "",
      note: exercise.note ?? "",
      sets:
        exercise.sets.length > 0
          ? exercise.sets.map((set) => ({
              id: set.id ?? crypto.randomUUID(),
              weight: String(set.weight),
              reps: String(set.reps),
              rpe: set.rpe == null ? "" : String(set.rpe),
            }))
          : [createDraftSet()],
    })),
  };
}

export default function WorkoutForm({
  mode,
  exercises,
  initialWorkout,
  defaultDate,
  defaultTitle,
  saveLabel,
  intro,
  draftKey,
  onSave,
  onCreateExercise,
  getRecommendation,
}: WorkoutFormProps) {
  const initialDraft = buildDraftFromWorkout(initialWorkout);
  // Wird nur im Initialwert gelesen, damit der Speicher-Effekt den Entwurf beim Mounten nicht überschreibt.
  const [savedDraft] = useState(() => (initialWorkout ? null : readWorkoutDraft(draftKey)));
  const [date, setDate] = useState(
    initialWorkout ? initialDraft.date : (savedDraft?.date ?? defaultDate)
  );
  const [title, setTitle] = useState(
    initialWorkout ? initialDraft.title : (savedDraft?.title ?? defaultTitle)
  );
  const [notes, setNotes] = useState(
    initialWorkout ? initialDraft.notes : (savedDraft?.notes ?? "")
  );
  const [exerciseDrafts, setExerciseDrafts] = useState<WorkoutDraftExercise[]>(() => {
    if (initialWorkout && initialDraft.exercises.length > 0) {
      return initialDraft.exercises;
    }

    if (savedDraft && savedDraft.exercises.length > 0) {
      return savedDraft.exercises;
    }

    return [createDraftExercise()];
  });
  // Die ID gehört zum Eintrag und bleibt bei einem erneuten Speicherversuch (auch nach
  // Neuladen, per Entwurf) gleich, damit nie ein zweites Workout entsteht.
  const [workoutId, setWorkoutId] = useState(
    () => initialWorkout?.id ?? savedDraft?.workoutId ?? crypto.randomUUID()
  );
  const [saving, setSaving] = useState(false);
  const persistDraft = useRef(true);

  useEffect(() => {
    if (!draftKey || initialWorkout || !persistDraft.current) {
      return;
    }

    writeWorkoutDraft(draftKey, { workoutId, date, title, notes, exercises: exerciseDrafts });
  }, [draftKey, initialWorkout, workoutId, date, title, notes, exerciseDrafts]);

  function updateExercise(exerciseId: string, updates: Partial<WorkoutDraftExercise>) {
    setExerciseDrafts((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...updates } : exercise
      )
    );
  }

  function addExercise() {
    setExerciseDrafts((current) => [...current, createDraftExercise()]);
  }

  function removeExercise(exerciseId: string) {
    setExerciseDrafts((current) =>
      current.length === 1
        ? [{ ...createDraftExercise() }]
        : current.filter((exercise) => exercise.id !== exerciseId)
    );
  }

  function addSet(exerciseId: string) {
    setExerciseDrafts((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, sets: [...exercise.sets, createDraftSet()] }
          : exercise
      )
    );
  }

  function removeSet(exerciseId: string, setId: string) {
    setExerciseDrafts((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const remainingSets = exercise.sets.filter((set) => set.id !== setId);

        return {
          ...exercise,
          sets: remainingSets.length > 0 ? remainingSets : [createDraftSet()],
        };
      })
    );
  }

  function updateSet(
    exerciseId: string,
    setId: string,
    field: keyof WorkoutDraftSet,
    value: string
  ) {
    setExerciseDrafts((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set) =>
            set.id === setId ? { ...set, [field]: value } : set
          ),
        };
      })
    );
  }

  async function submitWorkout() {
    const normalizedExercises = exerciseDrafts
      .filter((exercise) => exercise.exerciseId)
      .map((exercise) => ({
        ...exercise,
        sets: exercise.sets.filter((set) => set.weight && set.reps),
      }))
      .filter((exercise) => exercise.sets.length > 0);

    if (!title.trim()) {
      alert("Bitte gib dem Workout einen Titel.");
      return;
    }

    if (normalizedExercises.length === 0) {
      alert("Füge mindestens eine Übung mit Satzdaten hinzu.");
      return;
    }

    setSaving(true);

    try {
      const saved = await onSave({
        id: workoutId,
        date,
        title: title.trim(),
        notes: notes.trim(),
        exercises: normalizedExercises,
      });

      if (saved && !initialWorkout) {
        persistDraft.current = false;
        clearWorkoutDraft(draftKey);
        setDate(defaultDate);
        setTitle(defaultTitle);
        setNotes("");
        setExerciseDrafts([createDraftExercise()]);
        setWorkoutId(crypto.randomUUID());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-4xl border border-white/80 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          {mode === "live" ? "Live Workout" : "Training nachtragen"}
        </p>
        <h2 className="text-2xl font-black text-zinc-950">{title || defaultTitle || "Workout"}</h2>
        <p className="text-sm text-zinc-500">{intro}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-base"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />

        <input
          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-base"
          placeholder="Workout-Titel"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <textarea
        className="min-h-24 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-base"
        placeholder="Notizen, Fokus oder Queue für später"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      <div className="space-y-4">
        {exerciseDrafts.map((exerciseDraft, exerciseIndex) => {
          const selectedExercise =
            exercises.find((exercise) => exercise.id === exerciseDraft.exerciseId) ?? null;

          return (
            <section
              key={exerciseDraft.id}
              className="space-y-4 rounded-[1.75rem] border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Übung {exerciseIndex + 1}
                  </p>
                  <p className="text-lg font-bold text-zinc-900">
                    {exerciseDraft.exerciseName || "Noch keine Übung gewählt"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => removeExercise(exerciseDraft.id)}
                  className="rounded-full bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700"
                >
                  Entfernen
                </button>
              </div>

              <ExerciseSelect
                key={selectedExercise?.id ?? exerciseDraft.id}
                exercises={exercises}
                value={selectedExercise}
                recommendation={selectedExercise ? getRecommendation(selectedExercise.id) : null}
                onSelect={(exercise) => {
                  updateExercise(exerciseDraft.id, {
                    exerciseId: exercise.id,
                    exerciseName: exercise.name,
                  });
                }}
                onCreateExercise={onCreateExercise}
              />

              <input
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-base"
                placeholder="Optionale Übungsnotiz"
                value={exerciseDraft.note}
                onChange={(event) => updateExercise(exerciseDraft.id, { note: event.target.value })}
              />

              <div className="space-y-3">
                {exerciseDraft.sets.map((set, setIndex) => (
                  <div
                    key={set.id}
                    className="rounded-3xl border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-bold text-zinc-900">Satz {setIndex + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeSet(exerciseDraft.id, set.id)}
                        className="text-xs font-semibold text-rose-600"
                      >
                        Satz löschen
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <input
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-4 text-center text-base"
                        placeholder="kg"
                        type="number"
                        inputMode="decimal"
                        value={set.weight}
                        onChange={(event) =>
                          updateSet(exerciseDraft.id, set.id, "weight", event.target.value)
                        }
                      />

                      <input
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-4 text-center text-base"
                        placeholder="Wdh"
                        type="number"
                        inputMode="numeric"
                        value={set.reps}
                        onChange={(event) =>
                          updateSet(exerciseDraft.id, set.id, "reps", event.target.value)
                        }
                      />

                      <input
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-4 text-center text-base"
                        placeholder="RPE"
                        type="number"
                        step="0.5"
                        inputMode="decimal"
                        value={set.rpe}
                        onChange={(event) =>
                          updateSet(exerciseDraft.id, set.id, "rpe", event.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addSet(exerciseDraft.id)}
                className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-4 text-sm font-semibold text-zinc-900"
              >
                + Satz hinzufügen
              </button>
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addExercise}
        className="w-full rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm font-semibold text-zinc-900"
      >
        + Übung hinzufügen
      </button>

      <button
        type="button"
        onClick={() => void submitWorkout()}
        disabled={saving}
        className="w-full rounded-2xl bg-zinc-950 px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Speichere Workout..." : saveLabel}
      </button>
    </div>
  );
}