import type {
  RecommendationInput,
  RecommendationResult,
} from "@/types/workout";

function formatSet(weight: number, reps: number) {
  return `${weight} kg x ${reps}`;
}

export function getWorkoutRecommendation(
  input: RecommendationInput | null
): RecommendationResult | null {
  if (!input || input.latestPerformance.length === 0) {
    return null;
  }

  const totalRpe = input.latestPerformance.reduce(
    (sum, set) => sum + (set.rpe ?? 8),
    0
  );
  const averageRpe = totalRpe / input.latestPerformance.length;
  const reps = input.latestPerformance.map((set) => set.reps);
  const repsDrop = reps[0] - reps[reps.length - 1];

  let trend: RecommendationResult["trend"] = "hold";
  let deltaKg = 0;
  let suggestion = "Gewicht beibehalten und saubere Wiederholungen sammeln.";

  if (averageRpe <= 8.5 && repsDrop <= 1) {
    trend = "increase";
    deltaKg = 2.5;
    suggestion = "Letzte Einheit war stabil. Erhöhe beim nächsten Mal leicht.";
  } else if (averageRpe >= 9.5 || repsDrop >= 3) {
    trend = "decrease";
    deltaKg = -2.5;
    suggestion = "Die Leistung ist eingebrochen. Reduziere leicht und baue wieder sauber auf.";
  }

  return {
    summary: `Letzte Leistung ${input.exerciseName}: ${input.latestPerformance
      .map((set) => formatSet(set.weight, set.reps))
      .join(", ")}`,
    suggestion,
    deltaKg,
    trend,
  };
}