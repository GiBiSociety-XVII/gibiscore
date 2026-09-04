import {NextResponse} from 'next/server';
import {getTeamBrief} from '@/lib/football/data/teams';

// Last result and next match of a team, for the "my teams" rail. Cached one minute.
export const revalidate = 60;

export async function GET(_request: Request, {params}: RouteContext<'/api/teams/[slug]'>) {
    const {slug} = await params;
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json(null, {status: 400});
    const brief = await getTeamBrief(slug);
    return NextResponse.json(brief, {status: brief ? 200 : 404, headers: {'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'}});
}
