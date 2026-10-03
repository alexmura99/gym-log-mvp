"use client";

import { useState } from "react";
import { MUSCLE_GROUPS } from "@/types/workout";
import type { Exercise } from "@/types/workout";

type ExercisePayload = { name: string; muscleGroup: string };

type ExerciseManagerProps = {
  exercises: Exercise[];
  currentUserId: string;
  usage: Map<string, number>;
  findNameConflict: (name: string, ignoreId?: string) => Exercise | undefined;
  onCreate: (payload: ExercisePayload) => Promise<Exercise | null>;
  onUpdate: (id: string, payload: ExercisePayload) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onBack: () => void;
};

const fieldClass = "w-full rounded-2xl px-4 py-3";
const smallButton = "min-h-11 rounded-2xl px-4 py-3 text-sm font-semibold";

function workoutCountLabel(count: number) {
  return count === 1 ? "1 Workout" : `${count} Workouts`;
}

// Bekannte Muskelgruppen zuerst in fester Reihenfolge, unbekannte danach alphabetisch.
function sortGroups(groups: string[]) {
  const known = MUSCLE_GROUPS as readonly string[];

  return [...groups].sort((left, right) => {
    const leftIndex = known.indexOf(left);
    const rightIndex = known.indexOf(right);

    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    }

    return left.localeCompare(right);
  });
}

export default function ExerciseManager({
  exercises,
  currentUserId,
  usage,
  findNameConflict,
  onCreate,
  onUpdate,
  onDelete,
  onBack,
}: ExerciseManagerProps) {
  const [query, setQuery] = useState("");
  const [showStandard, setShowStandard] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<string>(MUSCLE_GROUPS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  // Standardübungen nur bei eingeschaltetem Schalter, auch in der Suche.
  const visibleExercises = exercises.filter(
    (exercise) =>
      (showStandard || (!exercise.is_public && exercise.user_id === currentUserId)) &&
      (!normalizedQuery ||
        `${exercise.name} ${exercise.muscle_group}`.toLowerCase().includes(normalizedQuery))
  );
  const groups = sortGroups([...new Set(visibleExercises.map((exercise) => exercise.muscle_group))]);
  const ownCount = exercises.filter(
    (exercise) => !exercise.is_public && exercise.user_id === currentUserId
  ).length;

  function closeForms() {
    setCreating(false);
    setEditingId(null);
    setConfirmDeleteId(null);
    setError(null);
  }

  function startCreate() {
    closeForms();
    setName("");
    setMuscleGroup(MUSCLE_GROUPS[0]);
    setCreating(true);
  }

  function startEdit(exercise: Exercise) {
    closeForms();
    setName(exercise.name);
    setMuscleGroup(exercise.muscle_group);
    setEditingId(exercise.id);
  }

  // Liefert den bereinigten Namen oder setzt eine Fehlermeldung und liefert null.
  function validName(ignoreId?: string) {
    const trimmed = name.trim().replace(/\s+/g, " ");

    if (!trimmed) {
      setError("Bitte gib einen Namen ein.");
      return null;
    }

    const conflict = findNameConflict(trimmed, ignoreId);

    if (conflict) {
      setError(
        `Eine Übung mit dem Namen „${conflict.name}“ gibt es schon${
          conflict.is_public ? " (Standardübung)" : ""
        }.`
      );
      return null;
    }

    setError(null);
    return trimmed;
  }

  async function submitCreate() {
    const trimmed = validName();

    if (!trimmed || busy) {
      return;
    }

    setBusy(true);

    try {
      const created = await onCreate({ name: trimmed, muscleGroup });

      if (created) {
        // Die neue Übung soll sichtbar sein, auch wenn gerade gesucht wurde.
        setQuery("");
        closeForms();
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(exercise: Exercise) {
    const trimmed = validName(exercise.id);

    if (!trimmed || busy) {
      return;
    }

    setBusy(true);

    try {
      const updated = await onUpdate(exercise.id, { name: trimmed, muscleGroup });

      if (updated) {
        closeForms();
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(exercise: Exercise) {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      const deleted = await onDelete(exercise.id);

      if (deleted) {
        closeForms();
      }
    } finally {
      setBusy(false);
    }
  }

  function renderForm(submitLabel: string, onSubmit: () => void) {
    // Steht eine ältere Muskelgruppe nicht in der Liste, bleibt sie auswählbar.
    const options: readonly string[] = (MUSCLE_GROUPS as readonly string[]).includes(muscleGroup)
      ? MUSCLE_GROUPS
      : [...MUSCLE_GROUPS, muscleGroup];

    return (
      <div className="space-y-3">
        <input
          className={fieldClass}
          placeholder="Name der Übung"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />

        <select
          className={fieldClass}
          value={muscleGroup}
          onChange={(event) => setMuscleGroup(event.target.value)}
        >
          {options.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className={`${smallButton} flex-1 bg-zinc-950 text-white disabled:opacity-60`}
          >
            {busy ? "Speichere..." : submitLabel}
          </button>
          <button
            type="button"
            onClick={closeForms}
            disabled={busy}
            className={`${smallButton} border border-zinc-300 text-zinc-900`}
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  function renderExercise(exercise: Exercise) {
    const isOwn = !exercise.is_public && exercise.user_id === currentUserId;
    const count = usage.get(exercise.id) ?? 0;
    const isEditing = editingId === exercise.id;
    const isConfirming = confirmDeleteId === exercise.id;

    return (
      <article
        key={exercise.id}
        className="space-y-3 rounded-3xl border border-zinc-200 bg-zinc-50 p-4"
      >
        {isEditing ? (
          renderForm("Speichern", () => void submitEdit(exercise))
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-zinc-950 [overflow-wrap:anywhere]">
                  {exercise.name}
                </p>
                <p className="text-sm text-zinc-500">in {workoutCountLabel(count)}</p>
              </div>
              {!isOwn && (
                <span className="shrink-0 rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700">
                  Standard
                </span>
              )}
            </div>

            {isOwn &&
              (isConfirming ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-rose-700">Wirklich löschen?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void confirmDelete(exercise)}
                      disabled={busy}
                      className={`${smallButton} flex-1 bg-rose-600 text-white disabled:opacity-60`}
                    >
                      {busy ? "Lösche..." : "Ja, löschen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={busy}
                      className={`${smallButton} border border-zinc-300 text-zinc-900`}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(exercise)}
                      className={`${smallButton} flex-1 bg-zinc-950 text-white`}
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeForms();
                        setConfirmDeleteId(exercise.id);
                      }}
                      disabled={count > 0}
                      className={`${smallButton} bg-rose-100 text-rose-700 disabled:opacity-40`}
                    >
                      Löschen
                    </button>
                  </div>
                  {count > 0 && (
                    <p className="text-xs text-zinc-500">
                      Wird in {workoutCountLabel(count)} verwendet und kann nicht gelöscht
                      werden.
                    </p>
                  )}
                </div>
              ))}
          </>
        )}
      </article>
    );
  }

  return (
    <section className="space-y-4 rounded-4xl border border-white/80 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      {/* Bleibt beim Scrollen unter der Statusleiste stehen, damit "Zurück" immer erreichbar ist. */}
      <div className="sticky top-[env(safe-area-inset-top)] z-40 -mx-2 -mt-2 flex items-center gap-3 rounded-3xl bg-white/95 px-2 py-2 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className={`${smallButton} shrink-0 border border-zinc-300 bg-white text-zinc-900`}
        >
          ‹ Zurück
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-zinc-950">Übungen</h2>
          <p className="text-xs text-zinc-500">
            {ownCount === 1 ? "1 eigene Übung" : `${ownCount} eigene Übungen`}
          </p>
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        Standardübungen lassen sich nicht ändern. Löschen geht nur, wenn die Übung in keinem
        Workout vorkommt.
      </p>

      {creating ? (
        <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
          {renderForm("Anlegen", () => void submitCreate())}
        </div>
      ) : (
        <button
          type="button"
          onClick={startCreate}
          className={`${smallButton} w-full border border-dashed border-zinc-300 bg-zinc-50 text-zinc-900`}
        >
          + Neue Übung anlegen
        </button>
      )}

      <input
        className={fieldClass}
        type="search"
        placeholder="Übung suchen"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <button
        type="button"
        role="switch"
        aria-checked={showStandard}
        onClick={() => setShowStandard((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-zinc-900">Standardübungen anzeigen</span>
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            showStandard ? "bg-zinc-950" : "bg-zinc-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
              showStandard ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      {groups.length === 0 && (
        <p className="text-sm text-zinc-500">
          {normalizedQuery
            ? "Keine Übung gefunden."
            : ownCount === 0 && !showStandard
              ? "Du hast noch keine eigenen Übungen. Mit dem Schalter kannst du die Standardübungen einblenden."
              : "Keine Übungen vorhanden."}
        </p>
      )}

      {groups.map((group) => {
        const inGroup = visibleExercises
          .filter((exercise) => exercise.muscle_group === group)
          .sort((left, right) => left.name.localeCompare(right.name));

        return (
          <div key={group} className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              {group} · {inGroup.length}
            </p>
            {inGroup.map(renderExercise)}
          </div>
        );
      })}
    </section>
  );
}
