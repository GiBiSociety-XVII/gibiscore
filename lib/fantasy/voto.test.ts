import {describe, expect, it} from 'vitest';
import {DEFAULT_CALIBRATION, fitCalibration, halfVoto, matchVoto, meanVoto, roleOfPosition, toVoto} from './voto';

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
    it('moves only the level, shrunk, for a role with few pairs', () => {
        // Five keepers all one vote above the default line: the level rises by 5/15 of a vote.
        const pairs = [7, 7.2, 6.8, 7.5, 6.5].map((rating) => ({rating, voto: toVoto(rating, 'P') + 1, role: 'P' as const}));
        const fitted = fitCalibration(pairs);
        expect(fitted.P.slope).toBe(DEFAULT_CALIBRATION.P.slope);
        expect(fitted.P.intercept - DEFAULT_CALIBRATION.P.intercept).toBeCloseTo(1 / 3, 2);
        expect(fitted.D).toEqual(DEFAULT_CALIBRATION.D);
    });

    it('keeps the default slope for a role with few pairs, and the whole default for an absurd line', () => {
        const few = fitCalibration([{rating: 7, voto: 6, role: 'A'}]);
        expect(few.A.slope).toBe(DEFAULT_CALIBRATION.A.slope);
        expect(Math.abs(few.A.intercept - DEFAULT_CALIBRATION.A.intercept)).toBeLessThan(0.1);
        const flat = Array.from({length: 200}, (_, i) => ({rating: 6 + (i % 20) * 0.1, voto: 6, role: 'P' as const}));
        expect(fitCalibration(flat).P).toEqual(DEFAULT_CALIBRATION.P);
    });
});

describe('the vote scale on the football pages', () => {
    it('reads a role from a provider position or a lineup letter', () => {
        expect(roleOfPosition('goalkeeper')).toBe('P');
        expect(roleOfPosition('G')).toBe('P');
        expect(roleOfPosition('Defender')).toBe('D');
        expect(roleOfPosition('F')).toBe('A');
        expect(roleOfPosition(null)).toBe('C');
    });
    it('shows a match as a vote in half points and a season as a mean with two decimals', () => {
        expect(halfVoto(7.13)).toBe(7);
        expect(halfVoto(6.26)).toBe(6.5);
        expect(halfVoto(5.4)).toBe(5.5);
        expect(matchVoto(8.2, 'defender')).toBe(7);
        expect(matchVoto(5.9, 'goalkeeper')).toBe(5.5);
        expect(meanVoto(7.13, 'midfielder')).toBeCloseTo(6.2, 1);
    });
});
