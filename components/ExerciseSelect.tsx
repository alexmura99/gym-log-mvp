"use client";

import { useMemo, useState } from "react";
import type { Exercise, RecommendationResult } from "@/types/workout";

type ExerciseSelectProps = {
  exercises: Exercise[];
  value: Exercise | null;
  recommendation: RecommendationResult | null;
  onSelect: (exercise: Exercise) => void;
  onCreateExercise: (payload: {
    name: string;
    muscleGroup: string;
  }) => Promise<Exercise | null>;
};

const MUSCLE_GROUPS = [
  "Brust",
  "Rücken",
  "Schultern",
  "Beine",
  "Bizeps",
  "Trizeps",
  "Core",
  "Ganzkörper",
];

export default function ExerciseSelect({
  exercises,
  value,
  recommendation,
  onSelect,
  onCreateExercise,
}: ExerciseSelectProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [muscleGroup, setMuscleGroup] = useState("Brust");
  const [isCreating, setIsCreating] = useState(false);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return exercises.slice(0, 8);
    }

    return exercises
      .filter((exercise) => {
        const haystack = `${exercise.name} ${exercise.muscle_group}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [exercises, query]);

  const exactMatch = exercises.find(
    (exercise) => exercise.name.toLowerCase() === query.trim().toLowerCase()
  );

  async function createExercise() {
    const name = query.trim();

    if (!name || exactMatch || isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      const created = await onCreateExercise({ name, muscleGroup });
      if (created) {
        onSelect(created);
      }
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-3 rounded-3xl border border-zinc-200 bg-zinc-50/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Übung</p>
          <p className="text-xs text-zinc-500">
            Wähle aus Standards oder lege direkt eine eigene Übung an.
          </p>
        </div>
        {value && (
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
            {value.muscle_group}
          </span>
        )}
      </div>

      <input
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-base"
        placeholder="Übung suchen oder neu anlegen"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="grid grid-cols-2 gap-2">
        {filteredExercises.map((exercise) => {
          const isSelected = value?.id === exercise.id;

          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onSelect(exercise)}
              className={`min-w-0 rounded-2xl border px-3 py-3 text-left text-sm! font-semibold! transition hyphens-auto [overflow-wrap:anywhere] ${
                isSelected
                  ? "border-amber-400 bg-amber-100 text-zinc-950"
                  : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              <span className="block">{exercise.name}</span>
              <span className="block text-xs font-medium text-zinc-500">
                {exercise.muscle_group}
              </span>
            </button>
          );
        })}
      </div>

      {!exactMatch && query.trim() && (
        <div className="space-y-2 rounded-2xl border border-dashed border-zinc-300 bg-white p-3">
          <select
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
            value={muscleGroup}
            onChange={(event) => setMuscleGroup(event.target.value)}
          >
            {MUSCLE_GROUPS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void createExercise()}
            disabled={isCreating}
            className="w-full rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isCreating ? "Erstelle Übung..." : `"${query.trim()}" hinzufügen`}
          </button>
        </div>
      )}

      {recommendation && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            recommendation.trend === "increase"
              ? "bg-emerald-100 text-emerald-900"
              : recommendation.trend === "decrease"
                ? "bg-rose-100 text-rose-900"
                : "bg-amber-100 text-amber-900"
          }`}
        >
          <p className="font-semibold">{recommendation.summary}</p>
          <p className="mt-1">{recommendation.suggestion}</p>
        </div>
      )}
    </div>
  );
}