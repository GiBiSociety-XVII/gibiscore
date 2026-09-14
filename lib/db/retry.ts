/**
 * A read that failed once (a statement cut short while the database was
 * busy, a gateway timeout, a dropped connection) usually goes through the
 * second time. Every page read goes through here: three attempts, a
 * short pause between them, the last error thrown.
 */
const DELAYS_MS = [250, 900];

export async function withRetry<T>(read: () => Promise<T>, attempts = DELAYS_MS.length + 1): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await read();
        } catch (error) {
            last = error;
            const delay = DELAYS_MS[Math.min(attempt, DELAYS_MS.length - 1)];
            if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw last;
}
