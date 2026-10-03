// Datumswerte sind überall "YYYY-MM-DD" in lokaler Zeit. toISOString() rechnet in UTC und
// liefert zwischen 0 und 2 Uhr deutscher Zeit das Datum von gestern.

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toLocalIsoDate(date: Date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Lokales Mitternacht-Datum statt UTC-Mitternacht (so macht es new Date("YYYY-MM-DD")).
export function parseIsoDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);

  if (!match) {
    return new Date(isoDate);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// z. B. "Sa., 03.10.2026"
export function formatDateGerman(isoDate: string) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parseIsoDate(isoDate));
}
