"use client";

import WorkoutForm from "@/components/WorkoutForm";
import type {
  Exercise,
  RecommendationResult,
  Workout,
  WorkoutSaveInput,
} from "@/types/workout";

type BackfillWorkoutProps = {
  exercises: Exercise[];
  editingWorkout: Workout | null;
  onSave: (payload: WorkoutSaveInput) => Promise<void>;
  onCancelEdit: () => void;
  onCreateExercise: (payload: {
    name: string;
    muscleGroup: string;
  }) => Promise<Exercise | null>;
  getRecommendation: (exerciseId: string) => RecommendationResult | null;
};

export default function BackfillWorkout({
  exercises,
  editingWorkout,
  onSave,
  onCancelEdit,
  onCreateExercise,
  getRecommendation,
}: BackfillWorkoutProps) {
  const defaultDate = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      {editingWorkout && (
        <div className="flex items-center justify-between rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div>
            <p className="font-semibold">Workout wird bearbeitet</p>
            <p>{editingWorkout.title}</p>
          </div>

          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-full bg-white px-3 py-2 font-semibold text-zinc-900"
          >
            Abbrechen
          </button>
        </div>
      )}

      <WorkoutForm
        key={editingWorkout?.id ?? `backfill-${defaultDate}`}
        mode="backfill"
        exercises={exercises}
        initialWorkout={editingWorkout}
        defaultDate={defaultDate}
        defaultTitle="Nachgetragenes Workout"
        saveLabel={editingWorkout ? "Änderungen speichern" : "Workout nachtragen"}
        intro="Für vergangene Sessions mit mehreren Übungen und Sätzen in einem Rutsch."
        onSave={onSave}
        onCreateExercise={onCreateExercise}
        getRecommendation={getRecommendation}
      />
    </div>
  );
}