export const WEEKDAY_OPTIONS = [
  { key: 1, label: "Mo" },
  { key: 2, label: "Di" },
  { key: 3, label: "Mi" },
  { key: 4, label: "Do" },
  { key: 5, label: "Fr" },
  { key: 6, label: "Sa" },
  { key: 0, label: "So" },
] as const;

export const APP_TABS = [
  { id: "plan", label: "Plan" },
  { id: "live", label: "Live" },
  { id: "backfill", label: "Nachtrag" },
  { id: "history", label: "Historie" },
  { id: "profile", label: "Profil" },
] as const;

export const MUSCLE_GROUPS = [
  "Brust",
  "Rücken",
  "Schultern",
  "Beine",
  "Bizeps",
  "Trizeps",
  "Core",
  "Ganzkörper",
] as const;

export type AppTab = (typeof APP_TABS)[number]["id"];

export type Exercise = {
  id: string;
  user_id: string | null;
  name: string;
  muscle_group: string;
  is_public: boolean;
  created_at?: string;
};

export type PlannerDay = {
  id: string;
  user_id: string;
  day_of_week: number;
  title: string;
  is_rest_day: boolean;
  position: number;
  notes: string | null;
  planned_exercise_ids: string[];
  created_at?: string;
};

export type WorkoutSet = {
  id?: string;
  user_id?: string;
  workout_id?: string;
  workout_exercise_id?: string;
  set_number: number;
  weight: number;
  reps: number;
  rpe: number | null;
  created_at?: string;
};

export type WorkoutExercise = {
  id?: string;
  user_id?: string;
  workout_id?: string;
  exercise_id: string;
  note: string | null;
  exercise?: Exercise | null;
  sets: WorkoutSet[];
};

export type Workout = {
  id: string;
  user_id: string;
  date: string;
  title: string;
  notes: string | null;
  created_at?: string;
  workout_exercises: WorkoutExercise[];
};

export type WorkoutDraftSet = {
  id: string;
  weight: string;
  reps: string;
  rpe: string;
};

export type WorkoutDraftExercise = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  note: string;
  sets: WorkoutDraftSet[];
};

export type WorkoutSaveInput = {
  // Vom Client einmal pro Workout erzeugt; bei einem erneuten Versuch dieselbe ID.
  id: string;
  date: string;
  title: string;
  notes: string;
  exercises: WorkoutDraftExercise[];
};

export type RecommendationInput = {
  exerciseName: string;
  latestPerformance: Array<{
    weight: number;
    reps: number;
    rpe: number | null;
  }>;
};

export type RecommendationResult = {
  summary: string;
  suggestion: string;
  deltaKg: number;
  trend: "increase" | "hold" | "decrease";
};