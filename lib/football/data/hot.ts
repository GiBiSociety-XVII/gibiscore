import 'server-only';

/**
 * A read that everybody shares for a few seconds.
 *
 * The live endpoints are asked by every open tab every few seconds. The
 * answer is the same for all of them, so it is read once: whoever
 * arrives while a read is running waits on that one, and whoever
 * arrives just after gets what it returned, until the window is out.
 * A thousand tabs then cost the database what one costs.
 *
 * Unlike a cache that serves what it has while it fetches, this one
 * never hands out an answer older than the window: past it, the reader
 * waits for the fresh one. On a live score a few tenths of a second of
 * waiting is worth far more than seconds of an old number.
 */

interface Slot<T> {
    /** When the value was read; 0 while the first read is still running. */
    at: number;
    value?: T;
    reading?: Promise<T>;
}

/** Distinct arguments held at once (a handful of days, the matches open): past this the lot is dropped. */
const MAX_SLOTS = 60;

export function shared<A extends unknown[], T>(windowMs: number, read: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
    const slots = new Map<string, Slot<T>>();
    return async (...args: A): Promise<T> => {
        const key = JSON.stringify(args);
        const now = Date.now();
        const slot = slots.get(key);
        if (slot?.reading) return slot.reading;
        if (slot && slot.at > 0 && now - slot.at < windowMs) return slot.value as T;
        if (slots.size > MAX_SLOTS) slots.clear();
        const reading = read(...args);
        slots.set(key, {at: 0, reading});
        try {
            const value = await reading;
            slots.set(key, {at: Date.now(), value});
            return value;
        } catch (error) {
            // A read that failed is not an answer: the next asker tries again.
            slots.delete(key);
            throw error;
        }
    };
}
