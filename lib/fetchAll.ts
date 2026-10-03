type Page = PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
}>;

type FetchAllResult<T> =
  | { data: T[]; error: null }
  | { data: null; error: { message: string } };

// Supabase liefert pro Abfrage höchstens 1000 Zeilen. fetchAll holt alle Zeilen seitenweise.
// Die Abfrage muss eine eindeutige Sortierung haben, sonst können Zeilen zwischen den Seiten
// doppelt oder gar nicht auftauchen. T legt den Zeilentyp fest (wie die bisherigen Casts).
export async function fetchAll<T>(
  buildPage: (from: number, to: number) => Page,
  pageSize = 1000
): Promise<FetchAllResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);

    if (error) {
      return { data: null, error };
    }

    const page = data ?? [];
    rows.push(...(page as T[]));

    if (page.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}
