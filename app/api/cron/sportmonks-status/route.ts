import {NextRequest, NextResponse} from 'next/server';
import {isAuthorizedCron} from '@/lib/cron';
import {getCompetitions, isValidationMode} from '@/lib/football/competitions';
import {sportmonksAccess, SportmonksError} from '@/lib/sportmonks/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Diagnostic, not a cron: shows what the Sportmonks token can read
 * (plan, add-ons, trial end, leagues) and whether each configured
 * competition is covered. Protected like the cron routes.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<deploy>/api/cron/sportmonks-status
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({error: 'unauthorized'}, {status: 401});
    }
    if (!process.env.SPORTMONKS_API_TOKEN) {
        return NextResponse.json({ok: false, error: 'SPORTMONKS_API_TOKEN is not set'}, {status: 500});
    }

    try {
        const access = await sportmonksAccess();
        const ids = new Set(access.leagues.map((l) => l.id));
        const configured = getCompetitions().map((c) => ({
            slug: c.slug ?? `league-${c.sportmonksId}`,
            sportmonks_id: c.sportmonksId,
            accessible: ids.has(c.sportmonksId),
            name_in_api: access.leagues.find((l) => l.id === c.sportmonksId)?.name ?? null,
        }));
        return NextResponse.json({
            ok: configured.some((c) => c.accessible),
            validation_mode: isValidationMode(),
            league_ids_override: process.env.SPORTMONKS_LEAGUE_IDS ?? null,
            plans: access.subscription?.plans ?? [],
            add_ons: access.subscription?.add_ons ?? [],
            trial_ends_at: access.subscription?.meta?.trial_ends_at ?? null,
            ends_at: access.subscription?.meta?.ends_at ?? null,
            configured,
            leagues_in_subscription: access.leagues,
        });
    } catch (error) {
        const err = error as Error;
        const status = error instanceof SportmonksError ? 502 : 500;
        return NextResponse.json({ok: false, error: err.message}, {status});
    }
}
