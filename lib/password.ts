// Regeln für neue Passwörter (Registrierung, später Zurücksetzen und Ändern im Profil).
// Beim Login gibt es keine Prüfung: Bestehende Konten dürfen kürzere Passwörter haben.
//
// MIN_PASSWORD_LENGTH muss mit der Einstellung in Supabase übereinstimmen (Authentication,
// Sign In / Providers, Email, "Minimum password length"), sonst erzwingt der Server etwas anderes
// als das Formular verspricht.

export const MIN_PASSWORD_LENGTH = 10;
// Das Verfahren zum Speichern der Passwörter (bcrypt) liest nur 72 Bytes.
export const MAX_PASSWORD_BYTES = 72;

export type PasswordProblems = {
  password: string | null;
  repeat: string | null;
};

// Passwörter werden bewusst nicht gekürzt (trim): Leerzeichen am Rand gehören zum Passwort.
export function validateNewPassword(password: string, repeat: string): PasswordProblems {
  let passwordProblem: string | null = null;

  if (password === "") {
    passwordProblem = "Bitte gib ein Passwort ein.";
  } else if ([...password].length < MIN_PASSWORD_LENGTH) {
    passwordProblem = `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  } else if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    passwordProblem =
      "Das Passwort ist zu lang (höchstens 72 Zeichen, Umlaute und Sonderzeichen zählen mehr).";
  }

  let repeatProblem: string | null = null;

  if (repeat === "") {
    repeatProblem = "Bitte wiederhole das Passwort.";
  } else if (repeat !== password) {
    repeatProblem = "Die Passwörter stimmen nicht überein.";
  }

  return { password: passwordProblem, repeat: repeatProblem };
}
