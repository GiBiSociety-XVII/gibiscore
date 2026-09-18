import {describe, expect, it} from 'vitest';
import {detectChanges, lineupsCandidate, reminderCandidate, type MatchEvent, type MatchFacts} from './events';

const facts = (over: Partial<MatchFacts> = {}): MatchFacts => ({home: 'Juventus', away: 'Inter', homeProviderId: 496, league: 'Serie A', state: 'live', minute: 30, homeScore: 1, awayScore: 0, events: [], ...over});
const goal = (over: Partial<MatchEvent> = {}): MatchEvent => ({kind: 'goal', teamProviderId: 496, minute: 28, extraMinute: null, player: 'Vlahović', ...over});

describe('detectChanges', () => {
    it('says nothing about a match never seen before', () => {
        expect(detectChanges(null, facts({events: [goal()]}))).toEqual([]);
    });
    it('reports the kick-off once the match leaves the schedule', () => {
        const out = detectChanges({state: 'scheduled', homeScore: null, awayScore: null}, facts({minute: 1, homeScore: 0, awayScore: 0}));
        expect(out.map((c) => c.kind)).toEqual(['kickoff']);
        expect(out[0].text.it.title).toBe("Calcio d'inizio: Juventus – Inter");
        expect(out[0].text.en.title).toBe('Kick-off: Juventus – Inter');
    });
    it('reports half-time and full-time with the score', () => {
        expect(detectChanges({state: 'live', homeScore: 1, awayScore: 0}, facts({state: 'half_time', minute: 45}))[0]).toMatchObject({kind: 'half_time', text: {it: {title: 'Fine primo tempo: Juventus 1-0 Inter'}, en: {title: 'Half time: Juventus 1-0 Inter'}}});
        expect(detectChanges({state: 'live', homeScore: 2, awayScore: 1}, facts({state: 'finished', minute: 90, homeScore: 2, awayScore: 1}))[0]).toMatchObject({kind: 'full_time', key: 'full_time', text: {it: {title: 'Finale: Juventus 2-1 Inter'}, en: {title: 'Full time: Juventus 2-1 Inter'}}});
        expect(detectChanges({state: 'half_time', homeScore: 1, awayScore: 0}, facts({state: 'half_time', minute: 45}))).toEqual([]);
    });
    it('names the scorer and the way of the goal', () => {
        const prev = {state: 'live' as const, homeScore: 0, awayScore: 0};
        expect(detectChanges(prev, facts({events: [goal()]}))[0]).toMatchObject({kind: 'goal', key: 'goal:496:28+0:Vlahović', text: {it: {title: '⚽ Gol Juventus! Juventus 1-0 Inter', body: "28' Vlahović · Serie A"}, en: {title: '⚽ Goal Juventus! Juventus 1-0 Inter'}}});
        expect(detectChanges(prev, facts({events: [goal({kind: 'penalty', teamProviderId: 505, player: 'Çalhanoğlu'})]}))[0].text.it.title).toBe('⚽ Gol Inter su rigore! Juventus 1-0 Inter');
        expect(detectChanges(prev, facts({events: [goal({kind: 'own_goal'})]}))[0].text.it.title).toContain('(autogol)');
        expect(detectChanges(prev, facts({events: [goal({kind: 'own_goal'})]}))[0].text.en.title).toContain('(own goal)');
    });
    it('keeps a fresh goal in stoppage time and drops a stale one', () => {
        const prev = {state: 'live' as const, homeScore: 0, awayScore: 0};
        const stale = goal({minute: 10});
        const fresh = goal({minute: 45, extraMinute: 3});
        const out = detectChanges(prev, facts({minute: 46, events: [stale, fresh]}));
        expect(out).toHaveLength(1);
        expect(out[0].key).toBe('goal:496:45+3:Vlahović');
        expect(out[0].text.it.body.startsWith("45+3'")).toBe(true);
    });
    it('reports a red card', () => {
        const out = detectChanges({state: 'live', homeScore: 1, awayScore: 0}, facts({minute: 70, events: [goal({kind: 'red_card', minute: 68, player: 'Bremer'})]}));
        expect(out[0]).toMatchObject({kind: 'red_card', key: 'red:496:68:Bremer', text: {it: {title: '🟥 Espulso Bremer (Juventus)'}, en: {title: '🟥 Sent off Bremer (Juventus)'}}});
    });
    it('ignores substitutions and yellow cards', () => {
        expect(detectChanges({state: 'live', homeScore: 0, awayScore: 0}, facts({events: [goal({kind: 'substitution'}), goal({kind: 'yellow_card'})]}))).toEqual([]);
    });
});

describe('lineupsCandidate', () => {
    it('announces the lineups', () => {
        expect(lineupsCandidate(facts())).toMatchObject({kind: 'lineups', key: 'lineups', text: {it: {title: 'Formazioni ufficiali: Juventus – Inter', body: 'Serie A'}, en: {title: 'Official lineups: Juventus – Inter'}}});
    });
});

describe('reminderCandidate', () => {
    it('says the hour in Rome time', () => {
        expect(reminderCandidate(facts(), '2026-09-19T18:45:00Z')).toMatchObject({kind: 'reminder', key: 'reminder', text: {it: {title: "Tra un'ora: Juventus – Inter", body: '20:45 · Serie A'}, en: {title: 'In an hour: Juventus – Inter'}}});
    });
});
