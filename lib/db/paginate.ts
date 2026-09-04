/**
 * PostgREST (Supabase Data API) returns at most 1000 rows per request,
 * whatever `.limit()` asks for. Walk the result in ranges until a short
 * page comes back. `page` receives the inclusive row range to select.
 */
export async function fetchAll<T>(
    page: (from: number, to: number) => PromiseLike<{data: T[] | null; error: {message: string} | null}>,
    options: {max?: number; size?: number} = {},
): Promise<T[]> {
    const size = options.size ?? 1000;
    const max = options.max ?? 20000;
    const out: T[] = [];
    for (let from = 0; from < max; from += size) {
        const {data, error} = await page(from, Math.min(from + size, max) - 1);
        if (error) throw error;
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < size) break;
    }
    return out;
}
