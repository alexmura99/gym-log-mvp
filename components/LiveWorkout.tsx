"use client";

import { useState } from "react";
import WorkoutForm from "@/components/WorkoutForm";
import {
  clearWorkoutDraft,
  liveWorkoutDraftKey,
  readWorkoutDraft,
} from "@/lib/workoutDraft";
import type {
  Exercise,
  RecommendationResult,
  WorkoutSaveInput,
} from "@/types/workout";

type LiveWorkoutProps = {
  userId: string;
  exercises: Exercise[];
  suggestedTitle: string;
  onSave: (payload: WorkoutSaveInput) => Promise<boolean>;
  onCreateExercise: (payload: {
    name: string;
    muscleGroup: string;
  }) => Promise<Exercise | null>;
  getRecommendation: (exerciseId: string) => RecommendationResult | null;
};

export default function LiveWorkout({
  userId,
  exercises,
  suggestedTitle,
  onSave,
  onCreateExercise,
  getRecommendation,
}: LiveWorkoutProps) {
  const draftKey = userId ? liveWorkoutDraftKey(userId) : undefined;
  // Ein gespeicherter Entwurf bedeutet: Es läuft noch ein Workout.
  const [isActive, setIsActive] = useState(() => readWorkoutDraft(draftKey) !== null);
  const today = new Date().toISOString().split("T")[0];

  if (!isActive) {
    return (
      <section className="space-y-4 rounded-4xl border border-white/80 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Live
          </p>
          <h2 className="text-2xl font-black text-zinc-950">Workout jetzt starten</h2>
          <p className="text-sm text-zinc-500">
            Ein Workout, mehrere Übungen, große Eingaben. Perfekt für den Satz direkt im Gym.
          </p>
        </div>

        <div className="rounded-3xl bg-zinc-50 p-4 text-sm text-zinc-600">
          <p className="font-semibold text-zinc-900">Vorschlag für heute</p>
          <p>{suggestedTitle || "Freies Workout"}</p>
        </div>

        <button
          type="button"
          onClick={() => setIsActive(true)}
          className="w-full rounded-2xl bg-zinc-950 px-4 py-4 text-base font-semibold text-white"
        >
          Live-Workout starten
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <WorkoutForm
        mode="live"
        exercises={exercises}
        defaultDate={today}
        defaultTitle={suggestedTitle || "Freies Workout"}
        saveLabel="Workout beenden und speichern"
        intro="Alles bleibt in einem Workout gebündelt, auch wenn du mehrere Übungen loggst."
        draftKey={draftKey}
        onSave={async (payload) => {
          const saved = await onSave(payload);

          if (saved) {
            setIsActive(false);
          }

          return saved;
        }}
        onCreateExercise={onCreateExercise}
        getRecommendation={getRecommendation}
      />

      <button
        type="button"
        onClick={() => {
          if (window.confirm("Laufendes Workout verwerfen? Alle Eingaben gehen verloren.")) {
            clearWorkoutDraft(draftKey);
            setIsActive(false);
          }
        }}
        className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700"
      >
        Workout verwerfen
      </button>
    </div>
  );
}
