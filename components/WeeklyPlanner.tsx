"use client";

import { useState } from "react";
import { WEEKDAY_OPTIONS } from "@/types/workout";
import type { Exercise, PlannerDay } from "@/types/workout";

type WeeklyPlannerProps = {
  days: PlannerDay[];
  exercises: Exercise[];
  onSaveDay: (dayId: string, updates: Partial<PlannerDay>) => Promise<void>;
  onDeleteDay: (dayId: string) => Promise<void>;
  onMoveDay: (fromId: string, toId: string) => Promise<void>;
  savingDayId: string | null;
};

type DraftState = {
  title: string;
  notes: string;
  isRestDay: boolean;
  plannedExerciseIds: string[];
};

function groupByMuscle(exercises: Exercise[]): Map<string, Exercise[]> {
  const map = new Map<string, Exercise[]>();
  for (const ex of exercises) {
    const group = map.get(ex.muscle_group) ?? [];
    group.push(ex);
    map.set(ex.muscle_group, group);
  }
  return map;
}

export default function WeeklyPlanner({
  days,
  exercises,
  onSaveDay,
  onDeleteDay,
  onMoveDay,
  savingDayId,
}: WeeklyPlannerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({
    title: "",
    notes: "",
    isRestDay: true,
    plannedExerciseIds: [],
  });

  const exerciseMap = new Map(exercises.map((ex) => [ex.id, ex]));
  const groupedExercises = groupByMuscle(exercises);
  const weekdayLabelMap = new Map(WEEKDAY_OPTIONS.map((weekday) => [weekday.key, weekday.label]));

  function startEditing(day: PlannerDay) {
    setEditingId(day.id);
    setDraft({
      title: day.is_rest_day ? "" : day.title,
      notes: day.notes ?? "",
      isRestDay: day.is_rest_day,
      plannedExerciseIds: day.planned_exercise_ids ?? [],
    });
  }

  function toggleExercise(exerciseId: string) {
    setDraft((current) => {
      const already = current.plannedExerciseIds.includes(exerciseId);
      return {
        ...current,
        plannedExerciseIds: already
          ? current.plannedExerciseIds.filter((id) => id !== exerciseId)
          : [...current.plannedExerciseIds, exerciseId],
      };
    });
  }

  // Tauscht den Inhalt mit dem Nachbartag (Tage sind nach Wochentag sortiert).
  function moveByButton(index: number, direction: -1 | 1) {
    const neighbor = days[index + direction];

    if (!neighbor) {
      return;
    }

    setEditingId(null);
    void onMoveDay(days[index].id, neighbor.id);
  }

  async function submitDay(dayId: string) {
    await onSaveDay(dayId, {
      title: draft.isRestDay ? "Ruhetag" : draft.title.trim() || "Training",
      notes: draft.notes.trim() || null,
      is_rest_day: draft.isRestDay,
      planned_exercise_ids: draft.isRestDay ? [] : draft.plannedExerciseIds,
    });

    setEditingId(null);
  }

  return (
    <section className="space-y-4 rounded-4xl border border-white/80 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          Plan
        </p>
        <h2 className="text-2xl font-black text-zinc-950">Wochenplanung</h2>
        <p className="text-sm text-zinc-500">
          Montag bis Sonntag. Trainingstage lassen sich bearbeiten, löschen und tauschen: mit den
          Pfeilen mit dem Nachbartag, am Rechner auch per Drag-and-Drop mit einem beliebigen Tag.
        </p>
      </div>

      <div className="space-y-3">
        {days.map((day, index) => {
          const weekdayKey = day.day_of_week as (typeof WEEKDAY_OPTIONS)[number]["key"];
          const weekdayLabel = weekdayLabelMap.get(weekdayKey) ?? `Tag ${index + 1}`;
          const isEditing = editingId === day.id;
          const isSaving = savingDayId === day.id;
          const plannedNames = (day.planned_exercise_ids ?? [])
            .map((id) => exerciseMap.get(id)?.name)
            .filter(Boolean) as string[];

          return (
            <article
              key={day.id}
              draggable={!isEditing}
              onDragStart={() => setDraggedId(day.id)}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedId && draggedId !== day.id) {
                  setEditingId(null);
                  void onMoveDay(draggedId, day.id);
                }

                setDraggedId(null);
              }}
              className={`rounded-[1.75rem] border p-4 transition ${
                day.is_rest_day
                  ? "border-zinc-200 bg-zinc-50"
                  : "border-amber-200 bg-amber-50/70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    {weekdayLabel}
                  </p>
                  <h3 className="text-lg font-bold text-zinc-950">
                    {day.is_rest_day ? "Ruhetag" : day.title}
                  </h3>
                  {day.notes && !isEditing && (
                    <p className="mt-1 text-sm text-zinc-600">{day.notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`${weekdayLabel} eine Position nach oben tauschen`}
                    disabled={index === 0}
                    onClick={() => moveByButton(index, -1)}
                    className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-zinc-900 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`${weekdayLabel} eine Position nach unten tauschen`}
                    disabled={index === days.length - 1}
                    onClick={() => moveByButton(index, 1)}
                    className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-zinc-900 disabled:opacity-30"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing(day)}
                    className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-zinc-900"
                  >
                    Bearbeiten
                  </button>
                </div>
              </div>

              {!isEditing && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700">
                    {day.is_rest_day ? "Ruhetag" : "Training"}
                  </span>
                  {plannedNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}

              {isEditing && (
                <div className="mt-4 space-y-3">
                  <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900">
                    <input
                      type="checkbox"
                      checked={draft.isRestDay}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          isRestDay: event.target.checked,
                          plannedExerciseIds: event.target.checked ? [] : current.plannedExerciseIds,
                        }))
                      }
                    />
                    Als Ruhetag markieren
                  </label>

                  {!draft.isRestDay && (
                    <>
                      <input
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-base"
                        placeholder="Titel, z. B. Push"
                        value={draft.title}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, title: event.target.value }))
                        }
                      />

                      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                          Geplante Übungen
                        </p>
                        <div className="max-h-56 space-y-3 overflow-y-auto">
                          {Array.from(groupedExercises.entries()).map(([muscle, exList]) => (
                            <div key={muscle}>
                              <p className="mb-1 text-xs font-semibold text-zinc-400">{muscle}</p>
                              <div className="space-y-1">
                                {exList.map((ex) => (
                                  <label
                                    key={ex.id}
                                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-sm text-zinc-900 hover:bg-zinc-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={draft.plannedExerciseIds.includes(ex.id)}
                                      onChange={() => toggleExercise(ex.id)}
                                    />
                                    {ex.name}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <textarea
                    className="min-h-20 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-base"
                    placeholder="Notizen oder Schwerpunkt"
                    value={draft.notes}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, notes: event.target.value }))
                    }
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void submitDay(day.id)}
                      disabled={isSaving}
                      className="flex-1 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {isSaving ? "Speichere..." : "Speichern"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                      }}
                      className="rounded-2xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-900"
                    >
                      Zurück
                    </button>
                  </div>

                  {!draft.isRestDay && (
                    <button
                      type="button"
                      onClick={() => void onDeleteDay(day.id)}
                      className="w-full rounded-2xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-700"
                    >
                      Trainingstag löschen
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
