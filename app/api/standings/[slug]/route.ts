import {NextResponse} from 'next/server';
import {getStandingsBySlug} from '@/lib/football/data/competitions';

// Compact table of a competition, for the favourites rail. Cached 5 minutes.
export const revalidate = 300;

export async function GET(_request: Request, {params}: RouteContext<'/api/standings/[slug]'>) {
    const {slug} = await params;
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json(null, {status: 400});
    const table = await getStandingsBySlug(slug);
    return NextResponse.json(table, {
        status: table ? 200 : 404,
        headers: {'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'},
    });
}
