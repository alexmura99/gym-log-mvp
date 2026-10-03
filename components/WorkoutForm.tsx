"use client";

import { useEffect, useRef, useState } from "react";
import ExerciseSelect from "@/components/ExerciseSelect";
import FieldHelp from "@/components/FieldHelp";
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
  // Vorbelegung für ein neues Workout ohne Entwurf (geplante Übungen); wird nur beim Start gelesen.
  initialExercises?: Exercise[];
  onSave: (payload: WorkoutSaveInput) => Promise<boolean>;
  onCreateExercise: (payload: {
    name: string;
    muscleGroup: string;
  }) => Promise<Exercise | null>;
  getRecommendation: (exerciseId: string) => RecommendationResult | null;
};

const RPE_BUTTONS = [
  { value: 6, hint: "4+ übrig", label: "vier oder mehr Wiederholungen übrig" },
  { value: 7, hint: "3 übrig", label: "drei Wiederholungen übrig" },
  { value: 8, hint: "2 übrig", label: "zwei Wiederholungen übrig" },
  { value: 9, hint: "1 übrig", label: "eine Wiederholung übrig" },
  { value: 10, hint: "Limit", label: "keine Wiederholung mehr möglich" },
];

// "8.5" -> "8,5" (alte Werte aus früheren Workouts können Halbschritte oder Ausreißer sein)
function formatRpe(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number).replace(".", ",") : value;
}

function weightInput(weight: number) {
  return String(Math.round(weight * 100) / 100);
}

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
  initialExercises,
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

    if (!initialWorkout && !savedDraft && initialExercises && initialExercises.length > 0) {
      return initialExercises.map((exercise) => {
        const draft = createDraftExercise();
        const recommendation = mode === "live" ? getRecommendation(exercise.id) : null;

        return {
          ...draft,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          // Empfohlenes Gewicht im ersten Satz vorbelegen, die Wiederholungen bleiben leer.
          sets: recommendation
            ? [{ ...draft.sets[0], weight: weightInput(recommendation.targetWeight) }]
            : draft.sets,
        };
      });
    }

    return [createDraftExercise()];
  });
  // Die ID gehört zum Eintrag und bleibt bei einem erneuten Speicherversuch (auch nach
  // Neuladen, per Entwurf) gleich, damit nie ein zweites Workout entsteht.
  const [workoutId, setWorkoutId] = useState(
    () => initialWorkout?.id ?? savedDraft?.workoutId ?? crypto.randomUUID()
  );
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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

  // Der neue Satz übernimmt das Gewicht des vorigen Satzes (Wiederholungen und RPE bleiben leer).
  function addSet(exerciseId: string) {
    setExerciseDrafts((current) =>
      current.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        const lastWeight = exercise.sets[exercise.sets.length - 1]?.weight ?? "";
        return {
          ...exercise,
          sets: [...exercise.sets, { ...createDraftSet(), weight: lastWeight }],
        };
      })
    );
  }

  // Im Live-Workout kommt das empfohlene Gewicht in den ersten Satz, sofern dort noch nichts
  // eingetippt wurde. Ein Gewicht, das nur von der Empfehlung der vorigen Übung stammt, wird ersetzt.
  function selectExercise(blockId: string, exercise: Exercise) {
    setExerciseDrafts((current) =>
      current.map((block) => {
        if (block.id !== blockId) {
          return block;
        }

        let sets = block.sets;

        if (mode === "live") {
          const previous = block.exerciseId ? getRecommendation(block.exerciseId) : null;
          const previousWeight = previous ? weightInput(previous.targetWeight) : null;
          const next = getRecommendation(exercise.id);
          const first = block.sets[0];

          if (first && first.reps === "" && (first.weight === "" || first.weight === previousWeight)) {
            sets = [
              { ...first, weight: next ? weightInput(next.targetWeight) : "" },
              ...block.sets.slice(1),
            ];
          }
        }

        return { ...block, exerciseId: exercise.id, exerciseName: exercise.name, sets };
      })
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

    // Eine Übung aus dem Entwurf kann inzwischen gelöscht worden sein.
    if (
      exercises.length > 0 &&
      normalizedExercises.some(
        (exercise) => !exercises.some((known) => known.id === exercise.exerciseId)
      )
    ) {
      alert("Eine gewählte Übung gibt es nicht mehr. Bitte wähle sie neu aus.");
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
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-amber-800 underline underline-offset-2"
        >
          ⓘ Was bedeuten die Felder?
        </button>
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
                    {selectedExercise?.name ?? (exerciseDraft.exerciseName || "Noch keine Übung gewählt")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => removeExercise(exerciseDraft.id)}
                  className="rounded-full bg-rose-100 px-3 py-2 text-xs font-semibold min-h-11 text-rose-700"
                >
                  Entfernen
                </button>
              </div>

              <ExerciseSelect
                key={selectedExercise?.id ?? exerciseDraft.id}
                exercises={exercises}
                value={selectedExercise}
                recommendation={selectedExercise ? getRecommendation(selectedExercise.id) : null}
                onSelect={(exercise) => selectExercise(exerciseDraft.id, exercise)}
                onCreateExercise={onCreateExercise}
              />

              <input
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-base"
                placeholder="Optionale Übungsnotiz"
                value={exerciseDraft.note}
                onChange={(event) => updateExercise(exerciseDraft.id, { note: event.target.value })}
              />

              <div className="space-y-3">
                {/* Spaltenüberschriften einmal pro Übung, bündig mit den Feldern des ersten Satzes. */}
                <div className="grid grid-cols-2 gap-2 px-[calc(0.75rem+1px)] text-xs font-semibold text-zinc-500">
                  <p>Gewicht (kg)</p>
                  <p>Wiederholungen</p>
                </div>

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
                        className="px-2 text-xs font-semibold min-h-11 text-rose-600"
                      >
                        Satz löschen
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
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
                    </div>

                    <div className="mt-3 space-y-2">
                      {(setIndex === 0 ||
                        (set.rpe !== "" && !RPE_BUTTONS.some((b) => b.value === Number(set.rpe)))) && (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-zinc-500">
                            {setIndex === 0 ? "RPE (optional)" : ""}
                          </p>
                          {set.rpe !== "" &&
                            !RPE_BUTTONS.some((b) => b.value === Number(set.rpe)) && (
                              <button
                                type="button"
                                onClick={() => updateSet(exerciseDraft.id, set.id, "rpe", "")}
                                className="min-h-11 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900"
                              >
                                RPE {formatRpe(set.rpe)} ✕
                              </button>
                            )}
                        </div>
                      )}
                      <div className="grid grid-cols-5 gap-1.5">
                        {RPE_BUTTONS.map(({ value, hint, label }) => {
                          const selected = set.rpe !== "" && Number(set.rpe) === value;

                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={selected}
                              aria-label={`RPE ${value}, ${label}`}
                              onClick={() =>
                                updateSet(
                                  exerciseDraft.id,
                                  set.id,
                                  "rpe",
                                  selected ? "" : String(value)
                                )
                              }
                              className={`min-h-14 rounded-2xl border px-0.5 py-1 font-semibold ${
                                selected
                                  ? "border-zinc-950 bg-zinc-950 text-white"
                                  : "border-zinc-200 bg-white text-zinc-700"
                              }`}
                            >
                              <span className="block text-base leading-6">{value}</span>
                              <span className="block text-[0.625rem] font-medium leading-tight opacity-80">
                                {hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addSet(exerciseDraft.id)}
                className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-4 text-sm font-semibold min-h-11 text-zinc-900"
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
        className="w-full rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm font-semibold min-h-11 text-zinc-900"
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

      {helpOpen && <FieldHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}