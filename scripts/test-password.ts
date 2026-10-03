// Prüft die Regeln für neue Passwörter (lib/password.ts).
// Aufruf: npm run test:password
import assert from "node:assert/strict";
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
} from "../lib/password.ts";

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

const ok = (password: string) => validateNewPassword(password, password);

console.log("Länge");

test(`Mindestlänge ist ${MIN_PASSWORD_LENGTH}`, () => {
  assert.equal(MIN_PASSWORD_LENGTH, 10);
});

test("9 Zeichen sind zu kurz, 10 reichen", () => {
  assert.equal(ok("a".repeat(9)).password, "Mindestens 10 Zeichen.");
  assert.equal(ok("a".repeat(10)).password, null);
});

test("leeres Passwort: eigene Meldung", () => {
  assert.equal(validateNewPassword("", "").password, "Bitte gib ein Passwort ein.");
});

test("Leerzeichen zählen und werden nicht abgeschnitten", () => {
  assert.equal(ok("ab cd ef gh").password, null);
  assert.equal(ok("   abcdefg").password, null);
  assert.equal(ok("         ").password, "Mindestens 10 Zeichen."); // 9 Leerzeichen
});

test("Umlaute zählen als ein Zeichen für die Mindestlänge", () => {
  assert.equal(ok("äöüäöüäöüä").password, null);
});

console.log("Höchstlänge (72 Bytes)");

test("72 Bytes sind erlaubt, 73 nicht", () => {
  assert.equal(MAX_PASSWORD_BYTES, 72);
  assert.equal(ok("a".repeat(72)).password, null);
  assert.match(ok("a".repeat(73)).password ?? "", /zu lang/);
});

test("Umlaute zählen für das Maximum doppelt (36 x ä = 72 Bytes, 37 zu viel)", () => {
  assert.equal(ok("ä".repeat(36)).password, null);
  assert.match(ok("ä".repeat(37)).password ?? "", /zu lang/);
});

console.log("Wiederholung");

test("gleiche Eingabe: keine Meldung", () => {
  assert.deepEqual(validateNewPassword("richtig-lang-genug", "richtig-lang-genug"), {
    password: null,
    repeat: null,
  });
});

test("abweichende Wiederholung: Meldung am Wiederholungsfeld", () => {
  const result = validateNewPassword("richtig-lang-genug", "richtig-lang-genuG");
  assert.equal(result.password, null);
  assert.equal(result.repeat, "Die Passwörter stimmen nicht überein.");
});

test("Groß-/Kleinschreibung zählt beim Vergleich", () => {
  assert.equal(validateNewPassword("Passwort1234", "passwort1234").repeat, "Die Passwörter stimmen nicht überein.");
});

test("leere Wiederholung: Aufforderung", () => {
  assert.equal(validateNewPassword("richtig-lang-genug", "").repeat, "Bitte wiederhole das Passwort.");
});

test("zu kurz UND abweichend: beide Meldungen getrennt", () => {
  const result = validateNewPassword("kurz", "kurzer");
  assert.equal(result.password, "Mindestens 10 Zeichen.");
  assert.equal(result.repeat, "Die Passwörter stimmen nicht überein.");
});

console.log(`\n${passed} bestanden, ${failures.length} fehlgeschlagen`);

if (failures.length > 0) {
  process.exitCode = 1;
}
