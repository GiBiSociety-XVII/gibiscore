import {describe, expect, it} from 'vitest';
import {quotaAllows} from './quota';

describe('quotaAllows', () => {
    it('lets a job start with enough of the day left, or when the provider says nothing', () => {
        expect(quotaAllows(3000, 1500)).toBe(true);
        expect(quotaAllows(1500, 1500)).toBe(true);
        expect(quotaAllows(null, 1500)).toBe(true);
    });

    it('holds a job when the reserve for the live jobs would be eaten', () => {
        expect(quotaAllows(1200, 1500)).toBe(false);
        expect(quotaAllows(0, 1500)).toBe(false);
    });
});
