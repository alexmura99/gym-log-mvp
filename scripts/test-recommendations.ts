// Prüft die Empfehlungslogik mit den Fällen aus dem Plan (Beispieltabelle und Grenzfälle).
// Aufruf: npm run test:recommendations
import assert from "node:assert/strict";
import { getWeightStep, getWorkoutRecommendation } from "../lib/recommendations.ts";

type SetInput = { weight: number; reps: number; rpe: number | null };

const s = (weight: number, reps: number, rpe: number | null = null): SetInput => ({
  weight,
  reps,
  rpe,
});

const times = (count: number, set: SetInput) => Array.from({ length: count }, () => ({ ...set }));

let passed = 0;
const failures: string[] = [];

function test(name: string, run: () => void) {
  try {
    run();
    passed += 1;
    console.log(`  OK   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FEHLER ${name}\n         ${(error as Error).message.split("\n")[0]}`);
  }
}

function rec(sessions: SetInput[][], range?: { min: number; max: number }) {
  const result = getWorkoutRecommendation({ sessions }, range);
  assert.ok(result, "Empfehlung erwartet");
  return result;
}

console.log("Beispieltabelle");

test("60 kg x 12,12,12 RPE 7,5 -> steigern auf 62,5 kg, Ziel 3 x 8", () => {
  const r = rec([times(3, s(60, 12, 7.5))]);
  assert.equal(r.trend, "increase");
  assert.equal(r.targetWeight, 62.5);
  assert.equal(r.targetReps, 8);
  assert.equal(r.targetSets, 3);
  assert.equal(r.targetLabel, "62,5 kg · 3 × 8");
});

test("60 kg x 12,12,12 RPE 9,5 -> halten, Ziel 3 x 12 mit RPE <= 9", () => {
  const r = rec([times(3, s(60, 12, 9.5))]);
  assert.equal(r.trend, "hold");
  assert.equal(r.targetWeight, 60);
  assert.equal(r.targetReps, 12);
  assert.equal(r.targetLabel, "60 kg · 3 × 12 (RPE ≤ 9)");
});

test("60 kg x 10,10,9 RPE 8,8,9 -> halten, Ziel 3 x 10", () => {
  const r = rec([[s(60, 10, 8), s(60, 10, 8), s(60, 9, 9)]]);
  assert.equal(r.trend, "hold");
  assert.equal(r.targetWeight, 60);
  assert.equal(r.targetLabel, "60 kg · 3 × 10");
});

test("60 kg x 8,7,6 RPE 9,5, einmal -> halten, Ziel 8 pro Satz", () => {
  const r = rec([[s(60, 8, 9.5), s(60, 7, 9.5), s(60, 6, 9.5)]]);
  assert.equal(r.trend, "hold");
  assert.equal(r.targetWeight, 60);
  assert.equal(r.targetLabel, "60 kg · 3 × 8");
});

test("60 kg x 8,7,6, zweimal in Folge -> verringern auf 57,5 kg", () => {
  const weak = [s(60, 8, 9.5), s(60, 7, 9.5), s(60, 6, 9.5)];
  const r = rec([weak, [s(60, 7), s(60, 6), s(60, 5)]]);
  assert.equal(r.trend, "decrease");
  assert.equal(r.targetWeight, 57.5);
  assert.equal(r.targetLabel, "57,5 kg · 3 × 8");
});

test("60 kg x 12,12,12 ohne RPE -> steigern, mit RPE-Hinweis", () => {
  const r = rec([times(3, s(60, 12))]);
  assert.equal(r.trend, "increase");
  assert.equal(r.targetWeight, 62.5);
  assert.match(r.suggestion, /Trag RPE ein/);
});

console.log("Grenzfälle");

test("keine Einheit -> keine Empfehlung", () => {
  assert.equal(getWorkoutRecommendation({ sessions: [] }), null);
  assert.equal(getWorkoutRecommendation({ sessions: [[]] }), null);
  assert.equal(getWorkoutRecommendation(null), null);
});

test("erste Einheit, schwach -> nur halten (Verringern braucht zwei Einheiten)", () => {
  const r = rec([[s(60, 5), s(60, 5), s(60, 5)]]);
  assert.equal(r.trend, "hold");
  assert.equal(r.targetWeight, 60);
});

test("letzte Einheit schwach, vorletzte nicht -> halten", () => {
  const r = rec([times(3, s(60, 5)), times(3, s(60, 10))]);
  assert.equal(r.trend, "hold");
});

test("7 Wdh. gelten nicht als deutlich unter dem Bereich (zweimal 7 -> halten)", () => {
  const r = rec([times(3, s(60, 7)), times(3, s(60, 7))]);
  assert.equal(r.trend, "hold");
  assert.equal(r.targetReps, 8);
});

test("6 Wdh. zweimal mit unterschiedlichem Gewicht -> verringern vom letzten Gewicht", () => {
  const r = rec([times(3, s(65, 6)), times(3, s(60, 5))]);
  assert.equal(r.trend, "decrease");
  assert.equal(r.targetWeight, 62.5);
});

test("nur ein Satz -> gleiche Regeln, Hinweis 'Basis: 1 Satz', Ziel ohne Satzzahl", () => {
  const r = rec([[s(60, 12, 8)]]);
  assert.equal(r.trend, "increase");
  assert.equal(r.targetLabel, "62,5 kg · 8 Wdh.");
  assert.match(r.suggestion, /Basis: 1 Satz/);
});

test("Aufwärmsätze zählen nicht: 40x10, 50x8, 80x12, 80x12 -> 82,5 kg, Ziel 2 x 8", () => {
  const r = rec([[s(40, 10), s(50, 8), s(80, 12), s(80, 12)]]);
  assert.equal(r.trend, "increase");
  assert.equal(r.targetWeight, 82.5);
  assert.equal(r.targetSets, 2);
  assert.deepEqual(
    r.lastSession.groups.map((g) => [g.weightLabel, g.repsLabel, g.isWorking]),
    [
      ["40 kg", "10 Wdh.", false],
      ["50 kg", "8 Wdh.", false],
      ["80 kg", "12, 12 Wdh.", true],
    ]
  );
});

test("Pyramide: nur der schwerste Satz zählt (80 kg x 8) -> halten, Ziel 9 Wdh.", () => {
  const r = rec([[s(60, 10), s(70, 10), s(80, 8), s(70, 10), s(60, 10)]]);
  assert.equal(r.trend, "hold");
  assert.equal(r.targetWeight, 80);
  assert.equal(r.targetLabel, "80 kg · 9 Wdh.");
  assert.match(r.suggestion, /Basis: 1 Satz/);
});

test("Eigengewicht: 0 kg x 12 -> steigern mit 2,5 kg Zusatzgewicht", () => {
  const r = rec([times(3, s(0, 12))]);
  assert.equal(r.trend, "increase");
  assert.equal(r.targetWeight, 2.5);
  assert.equal(r.targetLabel, "+2,5 kg Zusatzgewicht · 3 × 8");
});

test("Eigengewicht schwach, zweimal -> kein Verringern unter 0, halten", () => {
  const r = rec([times(3, s(0, 5)), times(3, s(0, 5))]);
  assert.equal(r.trend, "hold");
  assert.equal(r.targetWeight, 0);
  assert.equal(r.targetLabel, "Eigengewicht · 3 × 8");
});

test("RPE genau 9 -> noch steigern, 9,5 -> halten", () => {
  assert.equal(rec([times(3, s(60, 12, 9))]).trend, "increase");
  assert.equal(rec([times(3, s(60, 12, 9.5))]).trend, "hold");
});

test("RPE teilweise eingetragen: Durchschnitt nur über die eingetragenen", () => {
  assert.equal(rec([[s(60, 12, 8), s(60, 12), s(60, 12, 9)]]).trend, "increase");
  assert.equal(rec([[s(60, 12, 10), s(60, 12), s(60, 12)]]).trend, "hold");
});

test("Bereich als Parameter: 5-8 mit 100 kg x 8 -> steigern, Ziel 5", () => {
  const r = rec([times(3, s(100, 8))], { min: 5, max: 8 });
  assert.equal(r.trend, "increase");
  assert.equal(r.targetWeight, 102.5);
  assert.equal(r.targetReps, 5);
});

test("Dezimalgewicht: 62,5 kg x 12 -> 65 kg", () => {
  assert.equal(rec([times(3, s(62.5, 12))]).targetWeight, 65);
});

console.log("Anzeige der letzten Einheit");

test("eine Zeile pro Gewicht: 40x10, 50x10, 50x7 -> Arbeitssätze nur bei 50 kg", () => {
  const r = rec([[s(40, 10), s(50, 10), s(50, 7)]]);
  assert.deepEqual(r.lastSession.groups, [
    { weightLabel: "40 kg", repsLabel: "10 Wdh.", isWorking: false, setCount: 1, rpeLabel: null },
    { weightLabel: "50 kg", repsLabel: "10, 7 Wdh.", isWorking: true, setCount: 2, rpeLabel: null },
  ]);
});

test("leichtere Sätze NACH den Arbeitssätzen werden ebenfalls nicht gewertet", () => {
  const r = rec([[s(80, 8), s(80, 8), s(60, 12)]]);
  assert.deepEqual(
    r.lastSession.groups.map((g) => [g.weightLabel, g.isWorking]),
    [
      ["60 kg", false],
      ["80 kg", true],
    ]
  );
  assert.equal(r.targetWeight, 80);
});

test("Pyramide: Gewichte aufsteigend gruppiert, gleiche Gewichte zusammen", () => {
  const r = rec([[s(60, 10), s(70, 10), s(80, 8), s(70, 9), s(60, 10)]]);
  assert.deepEqual(
    r.lastSession.groups.map((g) => [g.weightLabel, g.repsLabel, g.isWorking]),
    [
      ["60 kg", "10, 10 Wdh.", false],
      ["70 kg", "10, 9 Wdh.", false],
      ["80 kg", "8 Wdh.", true],
    ]
  );
});

test("RPE-Beschriftung nur bei Arbeitssätzen: einheitlich, Durchschnitt oder keine", () => {
  assert.equal(rec([[s(60, 10, 8), s(60, 10, 8)]]).lastSession.groups[0].rpeLabel, "RPE 8");
  assert.equal(rec([[s(60, 10, 8), s(60, 10, 9)]]).lastSession.groups[0].rpeLabel, "RPE Ø 8,5");
  assert.equal(rec([[s(60, 10), s(60, 10)]]).lastSession.groups[0].rpeLabel, null);
  const mixed = rec([[s(40, 10, 6), s(60, 10, 8)]]).lastSession.groups;
  assert.equal(mixed[0].rpeLabel, null);
  assert.equal(mixed[1].rpeLabel, "RPE 8");
});

test("Eigengewicht: 'Eigengewicht: 12, 12, 12 Wdh.'", () => {
  const g = rec([times(3, s(0, 12))]).lastSession.groups;
  assert.equal(g.length, 1);
  assert.equal(g[0].weightLabel, "Eigengewicht");
  assert.equal(g[0].repsLabel, "12, 12, 12 Wdh.");
});

test("Datum der letzten Einheit wird durchgereicht", () => {
  const r = getWorkoutRecommendation({
    sessions: [times(3, s(60, 10))],
    lastSessionDate: "2026-10-03",
  });
  assert.equal(r?.lastSession.date, "2026-10-03");
  assert.equal(rec([times(3, s(60, 10))]).lastSession.date, null);
});

console.log("Einzahl bei genau einem Arbeitssatz");

test("ein Arbeitssatz: 'Der Arbeitssatz hat ...' und setCount 1", () => {
  const r = rec([[s(60, 12, 8)]]);
  assert.match(r.suggestion, /^Der Arbeitssatz hat die obere Grenze/);
  assert.equal(r.lastSession.groups[0].setCount, 1);
});

test("mehrere Arbeitssätze: 'Alle Arbeitssätze haben ...' und setCount 3", () => {
  const r = rec([times(3, s(60, 12, 8))]);
  assert.match(r.suggestion, /^Alle Arbeitssätze haben die obere Grenze/);
  assert.equal(r.lastSession.groups[0].setCount, 3);
});

test("ein schwacher Arbeitssatz: 'Der Arbeitssatz lag ...', sonst 'Der schwächste Satz lag ...'", () => {
  assert.match(rec([[s(60, 5)]]).suggestion, /^Der Arbeitssatz lag mit 5 Wdh\./);
  assert.match(rec([times(3, s(60, 5))]).suggestion, /^Der schwächste Satz lag mit 5 Wdh\./);
});

test("ein Arbeitssatz im Bereich: 'Der Arbeitssatz hatte ...'", () => {
  assert.match(rec([[s(60, 10)]]).suggestion, /Der Arbeitssatz hatte 10 Wdh\./);
});

console.log("Schrittgrößen");

test("2,5 % aufgerundet auf 2,5 kg, mindestens 2,5, höchstens 5", () => {
  const expected: Array<[number, number]> = [
    [0, 2.5],
    [20, 2.5],
    [40, 2.5],
    [60, 2.5],
    [100, 2.5],
    [120, 5],
    [200, 5],
    [300, 5],
  ];

  for (const [weight, step] of expected) {
    assert.equal(getWeightStep(weight), step, `${weight} kg`);
  }
});

console.log(`\n${passed} bestanden, ${failures.length} fehlgeschlagen`);

if (failures.length > 0) {
  process.exitCode = 1;
}
