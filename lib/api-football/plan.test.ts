import {describe, expect, it} from 'vitest';
import {BATCH_PER_MINUTE, PLAN, quotaAllows, quotaDay, quotaIsFresh, RESERVE} from './plan';

describe('plan', () => {
    it('keeps the batch lane well under the minute limit, and the reserves inside the day', () => {
        expect(BATCH_PER_MINUTE).toBeLessThan(PLAN.perMinute);
        expect(RESERVE.archive).toBeGreaterThan(RESERVE.routine);
        expect(RESERVE.archive).toBeLessThan(PLAN.perDay);
    });

    it('lets a job start with enough of the day left, or when the provider says nothing', () => {
        expect(quotaAllows(3000, 1500)).toBe(true);
        expect(quotaAllows(1500, 1500)).toBe(true);
        expect(quotaAllows(null, 1500)).toBe(true);
    });

    it('holds a job when the reserve for the live jobs would be eaten', () => {
        expect(quotaAllows(1200, 1500)).toBe(false);
        expect(quotaAllows(0, 1500)).toBe(false);
    });

    it('trusts a quota reading only on the same UTC day and for a short while', () => {
        const noon = Date.UTC(2026, 8, 6, 12, 0, 0);
        expect(quotaDay(noon)).toBe('2026-09-06');
        expect(quotaIsFresh(noon, noon + 5 * 60_000)).toBe(true);
        expect(quotaIsFresh(noon, noon + 40 * 60_000)).toBe(false);
        expect(quotaIsFresh(Date.UTC(2026, 8, 5, 23, 55), Date.UTC(2026, 8, 6, 0, 2))).toBe(false);
    });
});
