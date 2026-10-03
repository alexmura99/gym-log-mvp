const NETWORK_ERROR_PATTERN =
  /failed to fetch|load failed|networkerror|network request failed/i;

export const OFFLINE_TEXT_GENERIC =
  "Keine Verbindung. Die Änderung wurde nicht übernommen. Versuch es erneut, sobald du wieder online bist.";

export const OFFLINE_TEXT_SAVE_WORKOUT =
  "Keine Verbindung. Das Workout wurde nicht gespeichert, deine Eingaben bleiben erhalten. Versuch es erneut, sobald du wieder online bist.";

export const OFFLINE_TEXT_AUTH =
  "Keine Verbindung. Anmelden und Registrieren sind nur online möglich. Versuch es erneut, sobald du wieder online bist.";

export const OFFLINE_TEXT_LOAD =
  "Keine Verbindung. Daten werden geladen, sobald du wieder online bist.";

type ErrorLike = { message?: string } | null | undefined;

// Supabase liefert Netzwerkfehler nur als Text (z. B. "TypeError: Failed to fetch").
export function isNetworkError(error: ErrorLike) {
  if (!error) {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  return NETWORK_ERROR_PATTERN.test(error.message ?? "");
}

export function describeError(error: ErrorLike, offlineText = OFFLINE_TEXT_GENERIC) {
  return isNetworkError(error) ? offlineText : (error?.message ?? "Unbekannter Fehler");
}
