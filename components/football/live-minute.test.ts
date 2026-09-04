import {describe, expect, it} from 'vitest';
import {minuteLabel} from './live-minute';

const synced = '2026-09-04T20:00:00Z';
const at = (seconds: number) => Date.parse(synced) + seconds * 1000;

describe('minuteLabel', () => {
    it('shows the stored minute on the server and before any drift', () => {
        expect(minuteLabel({state: 'live', minute: 88, syncedAt: synced}, null)).toBe('88');
        expect(minuteLabel({state: 'live', minute: 88, syncedAt: synced}, at(30))).toBe('88');
    });

    it('adds the minutes elapsed since the sync', () => {
        expect(minuteLabel({state: 'live', minute: 88, syncedAt: synced}, at(65))).toBe('89');
        expect(minuteLabel({state: 'live', minute: 88, syncedAt: synced}, at(125))).toBe('90');
    });

    it('stops at the end of the period', () => {
        expect(minuteLabel({state: 'live', minute: 88, syncedAt: synced}, at(200))).toBe('90+');
        expect(minuteLabel({state: 'live', minute: 44, syncedAt: synced}, at(130))).toBe('45+');
        expect(minuteLabel({state: 'extra_time', minute: 104, syncedAt: synced}, at(130))).toBe('105+');
    });

    it('counts inside known stoppage time and never drifts too far', () => {
        expect(minuteLabel({state: 'live', minute: 90, extraMinute: 3, syncedAt: synced}, at(70))).toBe('90+4');
        expect(minuteLabel({state: 'live', minute: 90, extraMinute: 3, syncedAt: synced}, at(3600))).toBe('90+9');
    });

    it('handles missing data', () => {
        expect(minuteLabel({state: 'live', minute: null, syncedAt: synced}, at(70))).toBeNull();
        expect(minuteLabel({state: 'live', minute: 30, syncedAt: null}, at(70))).toBe('30');
    });
});
