import type {
  LastSessionGroup,
  RecommendationInput,
  RecommendationResult,
  RecommendationSet,
} from "@/types/workout";

// Doppelte Progression: erst die Wiederholungen bis zur oberen Grenze steigern, dann das Gewicht.
// Die RPE ist nur eine Bremse. Alle Werte sind zentral, damit sie später je Übung einstellbar werden.
export type RepRange = { min: number; max: number };

export const REP_RANGE: RepRange = { min: 8, max: 12 };

// Schrittgröße: 2,5 % des Arbeitsgewichts, aufgerundet auf 2,5 kg, mindestens 2,5 und höchstens 5 kg.
export const STEP_PERCENT = 0.025;
export const STEP_ROUNDING_KG = 2.5;
export const STEP_MIN_KG = 2.5;
export const STEP_MAX_KG = 5;

// "Deutlich unter dem Bereich" = mindestens so viele Wiederholungen unter der Untergrenze.
export const WEAK_REPS_BELOW_MIN = 2;
// Steigern ist nur bis zu dieser durchschnittlichen RPE erlaubt (unbekannte RPE bremst nicht).
export const RPE_LIMIT_FOR_INCREASE = 9;

type SessionAnalysis = {
  workingWeight: number;
  workingSets: RecommendationSet[];
  minReps: number;
  averageRpe: number | null;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// Deutsche Zahlendarstellung: 62.5 -> "62,5"
function formatNumber(value: number) {
  return String(round2(value)).replace(".", ",");
}

export function getWeightStep(weight: number) {
  const raw = weight * STEP_PERCENT;
  const rounded = Math.ceil(raw / STEP_ROUNDING_KG - 1e-9) * STEP_ROUNDING_KG;
  return Math.min(STEP_MAX_KG, Math.max(STEP_MIN_KG, rounded));
}

function analyzeSession(sets: RecommendationSet[]): SessionAnalysis {
  // Arbeitssätze = Sätze mit dem schwersten Gewicht der Einheit.
  const workingWeight = Math.max(...sets.map((set) => set.weight));
  const workingSets = sets.filter((set) => Math.abs(set.weight - workingWeight) < 0.001);
  const minReps = Math.min(...workingSets.map((set) => set.reps));
  const rpes = workingSets
    .map((set) => set.rpe)
    .filter((rpe): rpe is number => rpe !== null && rpe !== undefined);
  const averageRpe = rpes.length > 0 ? rpes.reduce((sum, rpe) => sum + rpe, 0) / rpes.length : null;

  return { workingWeight, workingSets, minReps, averageRpe };
}

// Eine Zeile pro Gewicht (aufsteigend); nur die Zeile mit dem Arbeitsgewicht zählt für die Empfehlung.
function buildGroups(sets: RecommendationSet[], workingWeight: number): LastSessionGroup[] {
  const byWeight: Array<{ weight: number; sets: RecommendationSet[] }> = [];

  for (const set of sets) {
    const existing = byWeight.find((group) => Math.abs(group.weight - set.weight) < 0.001);

    if (existing) {
      existing.sets.push(set);
    } else {
      byWeight.push({ weight: set.weight, sets: [set] });
    }
  }

  return byWeight
    .sort((left, right) => left.weight - right.weight)
    .map((group) => {
      const isWorking = Math.abs(group.weight - workingWeight) < 0.001;
      const rpes = group.sets
        .map((set) => set.rpe)
        .filter((rpe): rpe is number => rpe !== null && rpe !== undefined);
      let rpeLabel: string | null = null;

      if (isWorking && rpes.length > 0) {
        const allEqual = rpes.every((rpe) => rpe === rpes[0]);
        const average = rpes.reduce((sum, rpe) => sum + rpe, 0) / rpes.length;
        rpeLabel = allEqual ? `RPE ${formatNumber(rpes[0])}` : `RPE Ø ${formatNumber(average)}`;
      }

      return {
        weightLabel: group.weight === 0 ? "Eigengewicht" : `${formatNumber(group.weight)} kg`,
        repsLabel: `${group.sets.map((set) => set.reps).join(", ")} Wdh.`,
        isWorking,
        setCount: group.sets.length,
        rpeLabel,
      };
    });
}

function buildTargetLabel(
  weight: number,
  reps: number,
  sets: number,
  options: { additionalWeight?: boolean; rpeLimit?: boolean } = {}
) {
  const weightLabel = options.additionalWeight
    ? `+${formatNumber(weight)} kg Zusatzgewicht`
    : weight === 0
      ? "Eigengewicht"
      : `${formatNumber(weight)} kg`;
  const repsLabel = sets > 1 ? `${sets} × ${reps}` : `${reps} Wdh.`;
  return `${weightLabel} · ${repsLabel}${options.rpeLimit ? ` (RPE ≤ ${RPE_LIMIT_FOR_INCREASE})` : ""}`;
}

// sessions: die letzten Einheiten dieser Übung, die neueste zuerst (nur die ersten zwei zählen).
export function getWorkoutRecommendation(
  input: RecommendationInput | null,
  range: RepRange = REP_RANGE
): RecommendationResult | null {
  const sessions = (input?.sessions ?? []).filter((session) => session.length > 0);

  if (sessions.length === 0) {
    return null;
  }

  const last = analyzeSession(sessions[0]);
  const previous = sessions[1] ? analyzeSession(sessions[1]) : null;
  const isWeak = (analysis: SessionAnalysis) => analysis.minReps <= range.min - WEAK_REPS_BELOW_MIN;
  const setCount = last.workingSets.length;
  const basis = setCount === 1 ? " Basis: 1 Satz." : "";
  const allSets = setCount === 1 ? "Der Arbeitssatz hat" : "Alle Arbeitssätze haben";
  const weakestSet = setCount === 1 ? "Der Arbeitssatz" : "Der schwächste Satz";
  const rpeKnown = last.averageRpe !== null;
  const rpeText = rpeKnown ? ` (RPE Ø ${formatNumber(last.averageRpe as number)})` : "";
  const lastSession = {
    date: input?.lastSessionDate ?? null,
    groups: buildGroups(sessions[0], last.workingWeight),
  };
  const step = getWeightStep(last.workingWeight);

  // 1. Steigern: alle Arbeitssätze an der oberen Grenze, RPE nicht über 9 (oder unbekannt).
  if (
    last.minReps >= range.max &&
    (last.averageRpe === null || last.averageRpe <= RPE_LIMIT_FOR_INCREASE)
  ) {
    const bodyweight = last.workingWeight === 0;
    const targetWeight = round2(last.workingWeight + step);

    return {
      lastSession,
      suggestion:
        `${allSets} die obere Grenze (${range.max} Wdh.) erreicht${rpeText}. ` +
        `Steigere das Gewicht.${rpeKnown ? "" : " Trag RPE ein, dann kann ich genauer sein."}${basis}`,
      trend: "increase",
      targetWeight,
      targetReps: range.min,
      targetSets: setCount,
      targetLabel: buildTargetLabel(targetWeight, range.min, setCount, {
        additionalWeight: bodyweight,
      }),
    };
  }

  // 2. Verringern: zweimal in Folge deutlich unter dem Bereich (nicht unter 0 kg).
  if (isWeak(last) && previous && isWeak(previous) && last.workingWeight > 0) {
    const targetWeight = Math.max(0, round2(last.workingWeight - step));

    return {
      lastSession,
      suggestion:
        `Zweimal in Folge deutlich unter dem Bereich (höchstens ${range.min - WEAK_REPS_BELOW_MIN} ` +
        `Wdh.). Senke das Gewicht etwas und baue wieder auf.${basis}`,
      trend: "decrease",
      targetWeight,
      targetReps: range.min,
      targetSets: setCount,
      targetLabel: buildTargetLabel(targetWeight, range.min, setCount),
    };
  }

  // 3. Halten.
  if (last.minReps >= range.max) {
    return {
      lastSession,
      suggestion:
        `Obere Grenze erreicht, aber es war sehr hart${rpeText}. ` +
        `Bleib beim Gewicht und schaffe ${range.max} Wdh. mit RPE ≤ ${RPE_LIMIT_FOR_INCREASE}.${basis}`,
      trend: "hold",
      targetWeight: last.workingWeight,
      targetReps: range.max,
      targetSets: setCount,
      targetLabel: buildTargetLabel(last.workingWeight, range.max, setCount, { rpeLimit: true }),
    };
  }

  if (last.minReps < range.min) {
    return {
      lastSession,
      suggestion:
        `${weakestSet} lag mit ${last.minReps} Wdh. unter dem Bereich (${range.min}–${range.max}). ` +
        `Bleib beim Gewicht und arbeite dich auf ${range.min} Wdh. hoch.${basis}`,
      trend: "hold",
      targetWeight: last.workingWeight,
      targetReps: range.min,
      targetSets: setCount,
      targetLabel: buildTargetLabel(last.workingWeight, range.min, setCount),
    };
  }

  const targetReps = last.minReps + 1;

  return {
    lastSession,
    suggestion:
      `Bleib beim Gewicht und steigere die Wiederholungen: ` +
      `${weakestSet} hatte ${last.minReps} Wdh.${basis}`,
    trend: "hold",
    targetWeight: last.workingWeight,
    targetReps,
    targetSets: setCount,
    targetLabel: buildTargetLabel(last.workingWeight, targetReps, setCount),
  };
}
