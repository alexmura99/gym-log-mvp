"use client";

import WorkoutForm from "@/components/WorkoutForm";
import { toLocalIsoDate } from "@/lib/dates";
import type {
  Exercise,
  RecommendationResult,
  Workout,
  WorkoutSaveInput,
} from "@/types/workout";

type BackfillWorkoutProps = {
  exercises: Exercise[];
  editingWorkout: Workout | null;
  onSave: (payload: WorkoutSaveInput) => Promise<boolean>;
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
  const defaultDate = toLocalIsoDate();

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
        key={editingWorkout?.id ?? "backfill-new"}
        mode="backfill"
        exercises={exercises}
        initialWorkout={editingWorkout}
        defaultDate={defaultDate}
        defaultTitle="Nachgetragenes Workout"
        saveLabel={editingWorkout ? "Änderungen speichern" : "Workout nachtragen"}
        intro="Trag ein vergangenes Training mit allen Übungen und Sätzen nach."
        onSave={onSave}
        onCreateExercise={onCreateExercise}
        getRecommendation={getRecommendation}
      />
    </div>
  );
}