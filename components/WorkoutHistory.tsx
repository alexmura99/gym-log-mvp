"use client";

import { useState } from "react";
import { formatDateGerman, parseIsoDate, toLocalIsoDate } from "@/lib/dates";
import type { Workout } from "@/types/workout";

type WorkoutHistoryProps = {
  history: Workout[];
  onEdit: (workout: Workout) => void;
  onDelete: (workoutId: string) => Promise<void>;
};

type WorkoutWeekGroup = {
  key: string;
  label: string;
  workouts: Workout[];
};

function getWeekStart(date: Date) {
  const start = new Date(date);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dayOffset);
  return start;
}

function getIsoWeekNumber(date: Date) {
  const target = new Date(date.valueOf());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / 604800000);
}

function formatWeekLabel(weekStart: Date) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekNumber = getIsoWeekNumber(weekStart);
  const rangeFormatter = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
  return `Woche ${weekNumber} (${rangeFormatter.format(weekStart)} - ${rangeFormatter.format(weekEnd)})`;
}

function groupHistoryByWeek(history: Workout[]) {
  const groupMap = new Map<string, WorkoutWeekGroup>();

  for (const workout of history) {
    const weekStart = getWeekStart(parseIsoDate(workout.date));
    const weekKey = toLocalIsoDate(weekStart);
    const existing = groupMap.get(weekKey);

    if (existing) {
      existing.workouts.push(workout);
      continue;
    }

    groupMap.set(weekKey, {
      key: weekKey,
      label: formatWeekLabel(weekStart),
      workouts: [workout],
    });
  }

  return [...groupMap.values()];
}

export default function WorkoutHistory({
  history,
  onEdit,
  onDelete,
}: WorkoutHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(history[0]?.id ?? null);
  const weekGroups = groupHistoryByWeek(history);

  return (
    <div className="space-y-3 rounded-4xl border border-white/80 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          Historie
        </p>
        <h2 className="text-2xl font-black text-zinc-950">Gespeicherte Workouts</h2>
      </div>

      {history.length === 0 && (
        <p className="text-zinc-500">Noch keine Einträge.</p>
      )}

      {weekGroups.map((week) => (
        <section key={week.key} className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {week.label}
          </p>

          {week.workouts.map((workout) => {
            const isExpanded = expandedId === workout.id;

            return (
              <article key={workout.id} className="rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-4">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : workout.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                        {formatDateGerman(workout.date)}
                      </p>
                      <h3 className="text-lg font-bold text-zinc-950">{workout.title}</h3>
                      {workout.notes && (
                        <p className="mt-1 text-sm text-zinc-600">{workout.notes}</p>
                      )}
                    </div>
                    <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-zinc-700">
                      {workout.workout_exercises.length} Übungen
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-4 space-y-4">
                    {workout.workout_exercises.map((exercise) => (
                      <div key={exercise.id ?? exercise.exercise_id} className="rounded-3xl bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-zinc-950">
                              {exercise.exercise?.name ?? "Unbekannte Übung"}
                            </p>
                            {exercise.note && (
                              <p className="text-sm text-zinc-500">{exercise.note}</p>
                            )}
                          </div>

                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                            {exercise.sets.length} Sätze
                          </span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {exercise.sets.map((set) => (
                            <div
                              key={set.id ?? `${exercise.id}-${set.set_number}`}
                              className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3 py-3 text-sm text-zinc-700"
                            >
                              <span className="font-semibold text-zinc-900">Satz {set.set_number}</span>
                              <span>
                                {set.weight} kg x {set.reps}
                                {set.rpe != null ? ` · RPE ${set.rpe}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(workout)}
                        className="flex-1 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(workout.id)}
                        className="rounded-2xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-700"
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}