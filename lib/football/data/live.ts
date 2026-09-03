import 'server-only';
import {COMPETITIONS} from '../competitions';
import {LIVE_STATES, type CompetitionFixtures, type FixtureSummary} from '../types';
import {FIXTURE_SELECT, footballDb, logReadError, toFixtures} from './shared';

/** Start and end of "today" in Rome, as ISO strings. */
function romeDayBounds(offsetDays = 0): {from: string; to: string} {
    const now = new Date(Date.now() + offsetDays * 86_400_000);
    const rome = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
    // Rome is UTC+1 or UTC+2; widen the window by two hours on each side and
    // let the page group by local date, so no fixture falls between the cracks.
    const start = new Date(`${rome}T00:00:00+02:00`);
    return {
        from: new Date(start.getTime() - 2 * 3_600_000).toISOString(),
        to: new Date(start.getTime() + 26 * 3_600_000).toISOString(),
    };
}

export interface LivePage {
    date: string; // YYYY-MM-DD in Rome
    liveCount: number;
    groups: CompetitionFixtures[];
}

export async function getLivePage(offsetDays = 0): Promise<LivePage> {
    const {from, to} = romeDayBounds(offsetDays);
    const date = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Rome'}).format(new Date(Date.now() + offsetDays * 86_400_000));
    try {
        const db = footballDb();
        const {data, error} = await db
            .from('fixtures')
            .select(FIXTURE_SELECT)
            .gte('starting_at', from)
            .lte('starting_at', to)
            .order('starting_at', {ascending: true})
            .limit(200);
        if (error) throw error;

        const romeDate = (iso: string) => new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Rome'}).format(new Date(iso));
        const fixtures = toFixtures(data).filter((f) => romeDate(f.startingAt) === date);

        const priority = new Map(COMPETITIONS.map((c) => [c.slug, c.priority]));
        const bySlug = new Map<string, CompetitionFixtures>();
        for (const f of fixtures) {
            const slug = f.leagueSlug ?? f.leagueName;
            if (!bySlug.has(slug)) {
                bySlug.set(slug, {competition: {id: 0, name: f.leagueName, slug, country: null, logoUrl: null, type: null}, fixtures: []});
            }
            bySlug.get(slug)!.fixtures.push(f);
        }
        const groups = [...bySlug.values()].sort((a, b) => (priority.get(a.competition.slug) ?? 99) - (priority.get(b.competition.slug) ?? 99));
        const rank = (f: FixtureSummary) => (LIVE_STATES.includes(f.state) ? 0 : 1);
        for (const g of groups) g.fixtures.sort((a, b) => rank(a) - rank(b) || a.startingAt.localeCompare(b.startingAt));

        return {date, liveCount: fixtures.filter((f) => LIVE_STATES.includes(f.state)).length, groups};
    } catch (error) {
        logReadError('getLivePage', error);
        return {date, liveCount: 0, groups: []};
    }
}
