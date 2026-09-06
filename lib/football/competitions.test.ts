import {describe, expect, it} from 'vitest';
import {inTransferWindow} from './competitions';

describe('inTransferWindow', () => {
    it('knows the summer and winter windows', () => {
        expect(inTransferWindow(new Date(Date.UTC(2026, 7, 20)))).toBe(true);
        expect(inTransferWindow(new Date(Date.UTC(2026, 8, 10)))).toBe(true);
        expect(inTransferWindow(new Date(Date.UTC(2026, 8, 20)))).toBe(false);
        expect(inTransferWindow(new Date(Date.UTC(2026, 10, 5)))).toBe(false);
        expect(inTransferWindow(new Date(Date.UTC(2027, 0, 15)))).toBe(true);
        expect(inTransferWindow(new Date(Date.UTC(2027, 1, 20)))).toBe(false);
        expect(inTransferWindow(new Date(Date.UTC(2027, 5, 20)))).toBe(true);
    });
});
