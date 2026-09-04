/** Whether a job that may use many requests should start: never eat into the reserve the live jobs need. Pure. */
export function quotaAllows(remaining: number | null, reserve: number): boolean {
    return remaining === null || remaining >= reserve;
}
