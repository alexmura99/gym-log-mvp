import type { WorkoutDraftExercise } from "@/types/workout";

export type StoredWorkoutDraft = {
  workoutId: string;
  date: string;
  title: string;
  notes: string;
  exercises: WorkoutDraftExercise[];
};

export function liveWorkoutDraftKey(userId: string) {
  return `gym-log:live-draft:${userId}`;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStoredDraft(value: unknown): value is Omit<StoredWorkoutDraft, "workoutId"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const draft = value as Record<string, unknown>;

  if (
    !isString(draft.date) ||
    !isString(draft.title) ||
    !isString(draft.notes) ||
    !Array.isArray(draft.exercises)
  ) {
    return false;
  }

  return draft.exercises.every((exercise) => {
    if (!exercise || typeof exercise !== "object") {
      return false;
    }

    const row = exercise as Record<string, unknown>;

    return (
      isString(row.id) &&
      isString(row.exerciseId) &&
      isString(row.exerciseName) &&
      isString(row.note) &&
      Array.isArray(row.sets) &&
      row.sets.every((set) => {
        if (!set || typeof set !== "object") {
          return false;
        }

        const setRow = set as Record<string, unknown>;
        return (
          isString(setRow.id) &&
          isString(setRow.weight) &&
          isString(setRow.reps) &&
          isString(setRow.rpe)
        );
      })
    );
  });
}

export function readWorkoutDraft(key: string | undefined): StoredWorkoutDraft | null {
  if (!key || typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isStoredDraft(parsed)) {
      return null;
    }

    // Entwürfe aus früheren Versionen haben noch keine Workout-ID.
    const workoutId = (parsed as { workoutId?: unknown }).workoutId;
    return {
      ...parsed,
      workoutId: isString(workoutId) && workoutId ? workoutId : crypto.randomUUID(),
    };
  } catch {
    return null;
  }
}

export function writeWorkoutDraft(key: string, draft: StoredWorkoutDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Speicher voll oder gesperrt: Entwurf geht dann nur beim Neuladen verloren.
  }
}

export function clearWorkoutDraft(key: string | undefined) {
  if (!key || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nichts zu tun, wenn der Speicher nicht erreichbar ist.
  }
}
