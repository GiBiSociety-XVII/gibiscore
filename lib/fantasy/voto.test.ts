import {describe, expect, it} from 'vitest';
import {DEFAULT_CALIBRATION, fitCalibration, toVoto} from './voto';

describe('toVoto', () => {
    it('brings an average provider rating to an average fantasy vote, and compresses the spread', () => {
        expect(toVoto(6.9, 'C')).toBeCloseTo(6.03, 1);
        expect(toVoto(7.0, 'P')).toBeCloseTo(6.1, 1);
        // A 7.5 midfielder rating is a 6.5 vote, not a 7.5.
        expect(toVoto(7.5, 'C')).toBeGreaterThan(6.4);
        expect(toVoto(7.5, 'C')).toBeLessThan(6.6);
        expect(toVoto(8.0, 'A') - toVoto(6.0, 'A')).toBeLessThan(2);
    });
});

describe('fitCalibration', () => {
    it('fits a role its own line from enough pairs and leaves the others to the default', () => {
        const pairs = Array.from({length: 200}, (_, i) => {
            const rating = 6 + (i % 20) * 0.1;
            return {rating, voto: 5.5 + 0.5 * (rating - 6) + (i % 3) * 0.01, role: 'D' as const};
        });
        const cal = fitCalibration(pairs);
        expect(cal.D.slope).toBeCloseTo(0.5, 1);
        expect(cal.D.intercept).toBeCloseTo(5.5 - 0.5 * 6, 1);
        expect(cal.C).toEqual(DEFAULT_CALIBRATION.C);
    });
    it('keeps the default for a role with few pairs or an absurd line', () => {
        const few = fitCalibration([{rating: 7, voto: 6, role: 'A'}]);
        expect(few.A).toEqual(DEFAULT_CALIBRATION.A);
        const flat = Array.from({length: 200}, (_, i) => ({rating: 6 + (i % 20) * 0.1, voto: 6, role: 'P' as const}));
        expect(fitCalibration(flat).P).toEqual(DEFAULT_CALIBRATION.P);
    });
});
