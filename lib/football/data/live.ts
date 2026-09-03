import 'server-only';
import {featuredPriority} from '../competitions';
import {LIVE_STATES, type CompetitionFixtures, type FixtureSummary} from '../types';
import {FIXTURE_LIST_SELECT, footballDb, logReadError, toFixtures} from './shared';

const ROME = 'Europe/Rome';

function romeDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {timeZone: ROME}).format(date);
}

/** ISO bounds that surely contain the whole Rome day, widened by two hours. */
function romeDayBounds(day: string): {from: string; to: string} {
    const start = new Date(`${day}T00:00:00+02:00`);
    return {
        from: new Date(start.getTime() - 2 * 3_600_000).toISOString(),
        to: new Date(start.getTime() + 26 * 3_600_000).toISOString(),
    };
}

export interface CountryFixtures {
    country: string;
    competitions: CompetitionFixtures[];
}

export interface LivePage {
    mode: 'live' | 'day';
    /** YYYY-MM-DD in Rome: the day shown (today in live mode). */
    date: string;
    today: string;
    liveCount: number;
    total: number;
    featured: CompetitionFixtures[];
    countries: CountryFixtures[];
}

function group(fixtures: FixtureSummary[]): {featured: CompetitionFixtures[]; countries: CountryFixtures[]} {
    const bySlug = new Map<string, CompetitionFixtures>();
    for (const f of fixtures) {
        const slug = f.leagueSlug ?? f.leagueName;
        if (!bySlug.has(slug)) {
            bySlug.set(slug, {
                competition: {id: 0, name: f.leagueName, slug, country: f.leagueCountry ?? null, logoUrl: null, type: null, featured: f.leagueFeatured === true},
                fixtures: [],
            });
        }
        bySlug.get(slug)!.fixtures.push(f);
    }
    const rank = (f: FixtureSummary) => (LIVE_STATES.includes(f.state) ? 0 : 1);
    for (const g of bySlug.values()) g.fixtures.sort((a, b) => rank(a) - rank(b) || a.startingAt.localeCompare(b.startingAt));

    const featured = [...bySlug.values()]
        .filter((g) => g.competition.featured)
        .sort((a, b) => featuredPriority(a.competition.slug) - featuredPriority(b.competition.slug));

    const byCountry = new Map<string, CompetitionFixtures[]>();
    for (const g of bySlug.values()) {
        if (g.competition.featured) continue;
        const country = g.competition.country ?? 'World';
        if (!byCountry.has(country)) byCountry.set(country, []);
        byCountry.get(country)!.push(g);
    }
    const countries = [...byCountry.entries()]
        .map(([country, competitions]) => ({country, competitions: competitions.sort((a, b) => a.competition.name.localeCompare(b.competition.name))}))
        .sort((a, b) => (a.country === 'World' ? -1 : b.country === 'World' ? 1 : a.country.localeCompare(b.country)));

    return {featured, countries};
}

/**
 * Live mode (no date): only matches in play, every competition.
 * Day mode (date given): every match of that Rome day.
 */
export async function getLivePage(date?: string | null): Promise<LivePage> {
    const today = romeDate(new Date());
    const mode: LivePage['mode'] = date ? 'day' : 'live';
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
    try {
        const db = footballDb();
        let rows: unknown;
        if (mode === 'live') {
            const {data, error} = await db
                .from('fixtures')
                .select(FIXTURE_LIST_SELECT)
                .in('state', [...LIVE_STATES])
                .order('starting_at', {ascending: true})
                .limit(500);
            if (error) throw error;
            rows = data;
        } else {
            const {from, to} = romeDayBounds(day);
            const {data, error} = await db
                .from('fixtures')
                .select(FIXTURE_LIST_SELECT)
                .gte('starting_at', from)
                .lte('starting_at', to)
                .order('starting_at', {ascending: true})
                .limit(3000);
            if (error) throw error;
            rows = data;
        }
        const fixtures = toFixtures(rows).filter((f) => mode === 'live' || romeDate(new Date(f.startingAt)) === day);
        const {featured, countries} = group(fixtures);
        return {
            mode,
            date: day,
            today,
            liveCount: fixtures.filter((f) => LIVE_STATES.includes(f.state)).length,
            total: fixtures.length,
            featured,
            countries,
        };
    } catch (error) {
        logReadError('getLivePage', error);
        return {mode, date: day, today, liveCount: 0, total: 0, featured: [], countries: []};
    }
}
