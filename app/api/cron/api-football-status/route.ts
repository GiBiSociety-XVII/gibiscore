import {NextRequest, NextResponse} from 'next/server';
import {isAuthorizedCron} from '@/lib/cron';
import {getCompetitions, isOverrideActive} from '@/lib/football/competitions';
import {apiFootballGet, ApiFootballError, lastRateLimit} from '@/lib/api-football/client';
import {currentSeason} from '@/lib/api-football/mappers';
import type {AfLeagueResponse, AfStatusResponse} from '@/lib/api-football/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Diagnostic, not a cron: account plan and daily quota, plus the coverage
 * API-Football declares for each configured competition in its current
 * season. Costs 1 + number of competitions requests. Protected like the
 * cron routes.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<deploy>/api/cron/api-football-status
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({error: 'unauthorized'}, {status: 401});
    }
    if (!process.env.API_FOOTBALL_KEY) {
        return NextResponse.json({ok: false, error: 'API_FOOTBALL_KEY is not set'}, {status: 500});
    }

    try {
        const status = await apiFootballGet<AfStatusResponse>('status');
        const account = status.response;

        const competitions = [];
        for (const comp of getCompetitions()) {
            try {
                const {response} = await apiFootballGet<AfLeagueResponse[]>('leagues', {id: comp.providerId});
                const entry = response[0];
                const season = entry ? currentSeason(entry.seasons) : null;
                competitions.push({
                    slug: comp.slug ?? `league-${comp.providerId}`,
                    provider_id: comp.providerId,
                    found: Boolean(entry),
                    name_in_api: entry?.league.name ?? null,
                    country: entry?.country?.name ?? null,
                    season: season?.year ?? null,
                    coverage: season?.coverage ?? null,
                });
            } catch (error) {
                competitions.push({slug: comp.slug ?? `league-${comp.providerId}`, provider_id: comp.providerId, found: false, error: (error as Error).message});
            }
        }

        return NextResponse.json({
            ok: competitions.some((c) => c.found),
            plan: account?.subscription ?? null,
            requests_today: account?.requests ?? null,
            quota_headers: lastRateLimit,
            league_ids_override: isOverrideActive() ? process.env.API_FOOTBALL_LEAGUE_IDS : null,
            competitions,
        });
    } catch (error) {
        const err = error as Error;
        const status = error instanceof ApiFootballError ? 502 : 500;
        return NextResponse.json({ok: false, error: err.message, quota_headers: lastRateLimit}, {status});
    }
}
