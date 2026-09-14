import {NextResponse, type NextRequest} from 'next/server';
import {getMatchday} from '@/lib/fantasy/matchday-data';
import {footballDb} from '@/lib/football/data/shared';
import type {StatusResponse} from '@/lib/fantasy/alerts';

export const dynamic = 'force-dynamic';

/**
 * The state of some players for the round ahead, for the alerts on the
 * fantasy home: read off the cached matchday (two minutes) plus the
 * names, so the home can say who of a saved team is out, in doubt or
 * left out of the official lineup without loading the whole planner.
 */
export async function GET(request: NextRequest) {
    const ids = [...new Set((request.nextUrl.searchParams.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 400);
    if (ids.length === 0) return NextResponse.json({round: null, generatedAt: null, players: {}} satisfies StatusResponse);
    const [context, named] = await Promise.all([
        getMatchday('serie-a'),
        footballDb().from('players').select('id,name').in('id', ids).then(({data}) => (data ?? []) as Array<{id: number; name: string}>),
    ]);
    const players: StatusResponse['players'] = {};
    for (const p of named) {
        const ctx = context?.players[p.id];
        const official = context ? (context.official[p.id] ?? (ctx && context.officialTeams.includes(ctx.teamId) ? 'out' : null)) : null;
        players[p.id] = {name: p.name, official, sidelined: ctx?.sidelined ? {category: ctx.sidelined.category, description: ctx.sidelined.description} : null};
    }
    return NextResponse.json({round: context?.round ?? null, generatedAt: context?.generatedAt ?? null, players} satisfies StatusResponse, {headers: {'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'}});
}
