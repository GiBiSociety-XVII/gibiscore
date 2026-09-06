/**
 * The API-Football plan the site runs on (Pro): the two limits every job
 * must respect, and how the day is shared between the jobs. Pure.
 *
 * - 300 requests per minute, counted by the provider across everything we
 *   run in that minute: the live job, a batch job, a hand-launched job.
 * - 7,500 requests per day, reset at midnight UTC.
 */
export const PLAN = {
    perMinute: 300,
    perDay: 7500,
} as const;

/**
 * Requests a batch job may start per minute. Kept well under the plan so a
 * live tick (a handful of requests) and a second job in the same minute
 * never push the total past 300.
 */
export const BATCH_PER_MINUTE = 180;

/**
 * What must be left of the day before a job of that class starts. The
 * essential jobs (live scores, the day's fixtures) run down to the last
 * request; the routine ones keep the evening's live scores safe; the
 * archive jobs (squads, season statistics, past matches) only spend what
 * nobody else will need today.
 */
export const RESERVE = {
    essential: 0,
    routine: 800,
    archive: 2500,
} as const;

export type JobClass = keyof typeof RESERVE;

/** Whether a job that may use many requests should start: never eat into the reserve the live jobs need. */
export function quotaAllows(remaining: number | null, reserve: number): boolean {
    return remaining === null || remaining >= reserve;
}

/** The UTC day a timestamp belongs to, the unit the daily quota is counted in. */
export function quotaDay(at: number | Date): string {
    return new Date(at).toISOString().slice(0, 10);
}

/**
 * Whether a stored quota reading can still be trusted: same UTC day and
 * younger than `maxAgeMs`. Older readings miss what other jobs spent since.
 */
export function quotaIsFresh(readAt: number, now: number, maxAgeMs = 20 * 60_000): boolean {
    return quotaDay(readAt) === quotaDay(now) && now - readAt >= 0 && now - readAt <= maxAgeMs;
}
