import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncPlayerSeasons, type PlayerSeasonsScope} from '@/lib/football/sync/player-seasons';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SCOPES: PlayerSeasonsScope[] = ['auto', 'current', 'history', 'all'];

/**
 * Hourly: player season statistics of the featured leagues.
 * `?scope=current|history|all`, `?year=2024`, `?leagues=serie-a,serie-b`,
 * `?budget=800` (max API requests per run).
 */
export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams;
    const scope = SCOPES.find((s) => s === q.get('scope')) ?? 'auto';
    const year = q.get('year') ? Number(q.get('year')) : undefined;
    const leagues = q.get('leagues')?.split(',').map((s) => s.trim()).filter(Boolean);
    const budget = Math.min(Number(q.get('budget')) || 500, 2000);
    return cronRoute(() => syncPlayerSeasons({scope, year: Number.isFinite(year) ? year : undefined, leagues, budget}))(request);
}
