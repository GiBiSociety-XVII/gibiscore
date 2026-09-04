import 'server-only';
import {unstable_cache} from 'next/cache';
import {featuredPriority} from '../competitions';
import type {CompetitionSummary} from '../types';
import {fetchAll} from '@/lib/db/paginate';
import {LEAGUE_SELECT, footballDb, logReadError, toCompetition, type LeagueRow} from './shared';

/**
 * Competition navigation shared by every page (left sidebar, mobile chips,
 * competitions index): the pinned competitions and every country with its
 * leagues. ~1,100 rows that change once a day, so the result is cached for
 * an hour across requests.
 */

export interface NavCountry {
    name: string;
    code: string | null;
    competitions: CompetitionSummary[];
}

export interface Navigation {
    pinned: CompetitionSummary[];
    countries: NavCountry[];
    total: number;
}

const EMPTY: Navigation = {pinned: [], countries: [], total: 0};

async function loadNavigation(): Promise<Navigation> {
    try {
        const db = footballDb();
        const data = await fetchAll((a, b) => db.from('leagues').select(LEAGUE_SELECT).eq('is_active', true).order('name').order('id').range(a, b), {max: 5000});
        const items = (data as unknown as LeagueRow[]).map(toCompetition);
        const pinned = items.filter((c) => c.featured).sort((a, b) => featuredPriority(a.slug) - featuredPriority(b.slug));
        const byCountry = new Map<string, NavCountry>();
        for (const c of items) {
            const name = c.country ?? 'World';
            if (!byCountry.has(name)) byCountry.set(name, {name, code: c.countryCode, competitions: []});
            byCountry.get(name)!.competitions.push(c);
        }
        const countries = [...byCountry.values()].sort((a, b) => (a.name === 'World' ? -1 : b.name === 'World' ? 1 : a.name.localeCompare(b.name)));
        return {pinned, countries, total: items.length};
    } catch (error) {
        logReadError('getNavigation', error);
        return EMPTY;
    }
}

export const getNavigation = unstable_cache(loadNavigation, ['football-navigation'], {revalidate: 3600, tags: ['navigation']});
