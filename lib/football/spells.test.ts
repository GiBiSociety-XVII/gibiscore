import {describe, expect, it} from 'vitest';
import {addDays, buildSpells, daysBetween, estimateReturn} from './spells';

const row = (playerId: number, date: string, description = 'Knee Injury', category = 'injury', teamId = 10) => ({playerId, teamId, date, category, description});

describe('date helpers', () => {
    it('counts days and adds them', () => {
        expect(daysBetween('2026-08-23', '2026-09-05')).toBe(13);
        expect(addDays('2026-08-23', 13)).toBe('2026-09-05');
        expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    });
});

describe('buildSpells', () => {
    it('chains consecutive missed fixtures into one spell', () => {
        const spells = buildSpells([row(1, '2026-08-23'), row(1, '2026-08-23'), row(1, '2026-08-31'), row(1, '2026-09-05')], {today: '2026-09-04'});
        expect(spells).toHaveLength(1);
        expect(spells[0]).toMatchObject({since: '2026-08-23', last: '2026-09-05', missed: 3, active: true});
    });

    it('starts a new spell after a long gap and keeps the latest reason', () => {
        const spells = buildSpells([row(1, '2026-03-01', 'Hamstring Injury'), row(1, '2026-03-08', 'Hamstring Injury'), row(1, '2026-08-30', 'Red Card', 'suspension')], {today: '2026-09-04'});
        expect(spells[0]).toMatchObject({since: '2026-08-30', missed: 1, category: 'suspension', description: 'Red Card'});
    });

    it('closes the spell once the team has played again', () => {
        const rows = [row(1, '2026-08-23'), row(1, '2026-08-31')];
        expect(buildSpells(rows, {today: '2026-09-04', teamPlayedAfter: () => true})[0].active).toBe(false);
        expect(buildSpells(rows, {today: '2026-09-04', teamPlayedAfter: () => false})[0].active).toBe(true);
        expect(buildSpells(rows, {today: '2026-10-04'})[0].active).toBe(false);
    });

    it('keeps players of different teams apart', () => {
        const spells = buildSpells([row(1, '2026-08-23', 'Injury', 'injury', 10), row(1, '2026-08-30', 'Injury', 'injury', 11)], {today: '2026-09-01'});
        expect(spells).toHaveLength(2);
    });
});

describe('estimateReturn', () => {
    it('reads typical recovery windows from the reason', () => {
        const e = estimateReturn({category: 'injury', description: 'Hamstring Injury', since: '2026-08-23', last: '2026-09-05'}, '2026-09-04');
        expect(e.kind).toBe('range');
        expect(e.from).toBe('2026-09-13');
        expect(e.to).toBe('2026-09-27');
        expect(e.date).toBe('2026-09-20');
        expect(e.longTerm).toBe(false);
    });

    it('marks long absences and overdue windows', () => {
        expect(estimateReturn({category: 'injury', description: 'Cruciate Ligament Injury', since: '2026-08-01', last: '2026-09-05'}, '2026-09-04').longTerm).toBe(true);
        expect(estimateReturn({category: 'injury', description: 'Knock', since: '2026-08-01', last: '2026-08-08'}, '2026-09-04').kind).toBe('soon');
    });

    it('handles suspensions and unknown reasons', () => {
        expect(estimateReturn({category: 'suspension', description: 'Red Card', since: '2026-09-01', last: '2026-09-01'}, '2026-09-04').kind).toBe('nextMatch');
        expect(estimateReturn({category: 'other', description: "Coach's decision", since: '2026-09-01', last: '2026-09-01'}, '2026-09-04').kind).toBe('unknown');
        expect(estimateReturn({category: 'injury', description: 'Heart Problems', since: '2026-09-01', last: '2026-09-01'}, '2026-09-04').kind).toBe('unknown');
    });
});
