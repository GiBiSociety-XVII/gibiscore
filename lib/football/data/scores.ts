import 'server-only';
import {summarizeOdds, type OddsMarkets} from '../markets';
import {isBuildPhase} from '@/lib/db/phase';
import {featuredPriority} from '../competitions';
import {LIVE_STATES, type CompetitionFixtures, type FixtureSummary} from '../types';
import {fetchAll} from '@/lib/db/paginate';
import {withRetry} from '@/lib/db/retry';
import {FIXTURE_LIST_SELECT, footballDb, logReadError, toFixtures} from './shared';

const ROME = 'Europe/Rome';

export function romeDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {timeZone: ROME}).format(date);
}

export function isIsoDay(value: string | null | undefined): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

export function shiftDay(day: string, delta: number): string {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
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
    code: string | null;
    competitions: CompetitionFixtures[];
}

export interface ScoresPage {
    mode: 'live' | 'day';
    /** YYYY-MM-DD in Rome: the day shown (today in live mode). */
    date: string;
    today: string;
    liveCount: number;
    finishedCount: number;
    scheduledCount: number;
    total: number;
    /** Pinned competitions first, then every other country alphabetically. */
    pinned: CompetitionFixtures[];
    countries: CountryFixtures[];
}

function group(fixtures: FixtureSummary[]): {pinned: CompetitionFixtures[]; countries: CountryFixtures[]} {
    const bySlug = new Map<string, CompetitionFixtures>();
    for (const f of fixtures) {
        const slug = f.leagueSlug ?? f.leagueName;
        if (!bySlug.has(slug)) {
            bySlug.set(slug, {
                competition: {
                    id: 0,
                    name: f.leagueName,
                    slug,
                    country: f.leagueCountry ?? null,
                    countryCode: f.leagueCountryCode ?? null,
                    logoUrl: f.leagueLogoUrl ?? null,
                    type: null,
                    featured: f.leagueFeatured === true,
                },
                fixtures: [],
            });
        }
        bySlug.get(slug)!.fixtures.push(f);
    }
    for (const g of bySlug.values()) g.fixtures.sort((a, b) => a.startingAt.localeCompare(b.startingAt));

    const pinned = [...bySlug.values()]
        .filter((g) => g.competition.featured)
        .sort((a, b) => featuredPriority(a.competition.slug) - featuredPriority(b.competition.slug));

    const byCountry = new Map<string, CountryFixtures>();
    for (const g of bySlug.values()) {
        if (g.competition.featured) continue;
        const country = g.competition.country ?? 'World';
        if (!byCountry.has(country)) byCountry.set(country, {country, code: g.competition.countryCode, competitions: []});
        byCountry.get(country)!.competitions.push(g);
    }
    const countries = [...byCountry.values()]
        .map((c) => ({...c, competitions: c.competitions.sort((a, b) => a.competition.name.localeCompare(b.competition.name))}))
        .sort((a, b) => (a.country === 'World' ? -1 : b.country === 'World' ? 1 : a.country.localeCompare(b.country)));

    return {pinned, countries};
}

/**
 * Live mode: only matches in play, every competition.
 * Day mode: every match of that Rome day.
 */
/** The bookmakers' average 1X2 on the featured matches of the list not yet played: one query, nothing when there are none. */
async function attachOdds(db: ReturnType<typeof footballDb>, fixtures: FixtureSummary[]): Promise<void> {
    const wanted = fixtures.filter((f) => f.state === 'scheduled' && f.leagueFeatured);
    if (wanted.length === 0) return;
    try {
        const rows: Array<{fixture_id: number; bookmaker: string; markets: OddsMarkets}> = [];
        for (let i = 0; i < wanted.length; i += 200) {
            const {data, error} = await db.from('fixture_odds').select('fixture_id,bookmaker,markets').in('fixture_id', wanted.slice(i, i + 200).map((f) => f.id)).limit(5000);
            if (error) throw error;
            rows.push(...((data ?? []) as typeof rows));
        }
        const byFixture = new Map<number, typeof rows>();
        for (const r of rows) byFixture.set(r.fixture_id, [...(byFixture.get(r.fixture_id) ?? []), r]);
        for (const f of wanted) {
            const outcome = summarizeOdds((byFixture.get(f.id) ?? []).map((r) => ({bookmaker: r.bookmaker, markets: r.markets ?? {}})))?.outcome;
            if (outcome) f.odds = {home: outcome.home.avg, draw: outcome.draw.avg, away: outcome.away.avg};
        }
    } catch (error) {
        // The list is worth more than its odds: without them it still shows.
        logReadError('attachOdds', error);
    }
}

export async function getScores(options: {mode: 'live'} | {mode: 'day'; date: string}): Promise<ScoresPage> {
    const today = romeDate(new Date());
    const mode = options.mode;
    const day = mode === 'day' && isIsoDay(options.date) ? options.date : today;
    const empty: ScoresPage = {mode, date: day, today, liveCount: 0, finishedCount: 0, scheduledCount: 0, total: 0, pinned: [], countries: []};
    try {
        const db = footballDb();
        let rows: unknown;
        if (mode === 'live') {
            rows = await withRetry(async () => {
                const {data, error} = await db.from('fixtures').select(FIXTURE_LIST_SELECT).in('state', [...LIVE_STATES]).order('starting_at').limit(500);
                if (error) throw error;
                return data;
            });
        } else {
            const {from, to} = romeDayBounds(day);
            // A busy Saturday has well over 1000 matches worldwide: page through them.
            rows = await fetchAll((a, b) => db.from('fixtures').select(FIXTURE_LIST_SELECT).gte('starting_at', from).lte('starting_at', to).order('starting_at').order('id').range(a, b), {max: 6000});
        }
        const fixtures = toFixtures(rows).filter((f) => mode === 'live' || romeDate(new Date(f.startingAt)) === day);
        await attachOdds(db, fixtures);
        const {pinned, countries} = group(fixtures);
        return {
            ...empty,
            liveCount: fixtures.filter((f) => LIVE_STATES.includes(f.state)).length,
            finishedCount: fixtures.filter((f) => f.state === 'finished').length,
            scheduledCount: fixtures.filter((f) => f.state === 'scheduled').length,
            total: fixtures.length,
            pinned,
            countries,
        };
    } catch (error) {
        // Thrown, not swallowed: a page that fails to render keeps its last good copy (ISR), while an
        // empty page would be cached and shown to everyone as "no matches" for the next half minute.
        // At build time (a prerender without the database) an empty page is the honest fallback.
        logReadError('getScores', error);
        if (isBuildPhase()) return empty;
        throw error;
    }
}
