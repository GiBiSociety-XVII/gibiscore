import {describe, expect, it} from 'vitest';
import {lastWindowClose, resolveClub, type ClubEvidence} from './membership';

const CLOSED = '2026-09-02';

describe('lastWindowClose', () => {
    it('is the day after the last deadline', () => {
        expect(lastWindowClose('2026-09-09')).toBe('2026-09-02');
        expect(lastWindowClose('2026-09-01')).toBe('2026-02-03');
        expect(lastWindowClose('2026-08-20')).toBe('2026-02-03');
        expect(lastWindowClose('2027-01-15')).toBe('2026-09-02');
        expect(lastWindowClose('2027-02-03')).toBe('2027-02-03');
    });
});

describe('resolveClub', () => {
    it('a stale squad list loses to matches played after the window closed (Calò)', () => {
        const evidence: ClubEvidence[] = [
            {kind: 'squad', teamId: 1},
            {kind: 'line', teamId: 2, appearances: 3},
            {kind: 'played', teamId: 2, date: '2026-08-23'},
            {kind: 'played', teamId: 2, date: '2026-09-06'},
        ];
        expect(resolveClub(evidence, CLOSED)).toBe(2);
    });

    it('a deadline move: played for the old club in August, listed by the new one (David)', () => {
        const evidence: ClubEvidence[] = [
            {kind: 'line', teamId: 2, appearances: 1},
            {kind: 'played', teamId: 2, date: '2026-08-29'},
            {kind: 'squad', teamId: 3},
        ];
        expect(resolveClub(evidence, CLOSED)).toBe(3);
    });

    it('the newest matchday squad decides between two clubs seen this season (Kean)', () => {
        const evidence: ClubEvidence[] = [
            {kind: 'played', teamId: 2, date: '2026-08-24'},
            {kind: 'sidelined', teamId: 2, date: '2026-08-29'},
            {kind: 'played', teamId: 3, date: '2026-09-04'},
            {kind: 'squad', teamId: 3},
        ];
        expect(resolveClub(evidence, CLOSED)).toBe(3);
    });

    it('an injured player in no squad list belongs to the club that reports him missing (Pellegrini)', () => {
        const evidence: ClubEvidence[] = [{kind: 'sidelined', teamId: 4, date: '2026-09-10'}];
        expect(resolveClub(evidence, CLOSED)).toBe(4);
    });

    it('before the window closes the squad list wins over an injury report at the old club (Ahanor)', () => {
        const evidence: ClubEvidence[] = [
            {kind: 'sidelined', teamId: 2, date: '2026-08-31'},
            {kind: 'squad', teamId: 5},
        ];
        expect(resolveClub(evidence, CLOSED)).toBe(5);
    });

    it('listed by two clubs: the one he has been seen with', () => {
        const evidence: ClubEvidence[] = [
            {kind: 'squad', teamId: 1},
            {kind: 'squad', teamId: 2},
            {kind: 'played', teamId: 2, date: '2026-08-23'},
        ];
        expect(resolveClub(evidence, CLOSED)).toBe(2);
    });

    it('no squad list and nothing dated: a statistics line with appearances, else nobody', () => {
        expect(resolveClub([{kind: 'line', teamId: 2, appearances: 2}], CLOSED)).toBe(2);
        expect(resolveClub([{kind: 'line', teamId: 2, appearances: 0}], CLOSED)).toBeNull();
        expect(resolveClub([], CLOSED)).toBeNull();
    });

    it('no squad list, pre-window evidence only: the latest dated club (Dybala in August)', () => {
        const evidence: ClubEvidence[] = [
            {kind: 'line', teamId: 4, appearances: 2},
            {kind: 'played', teamId: 4, date: '2026-08-29'},
        ];
        expect(resolveClub(evidence, '2026-02-03')).toBe(4);
    });
});
