import {NextResponse, type NextRequest} from 'next/server';
import {search} from '@/lib/football/data/search';

// Typeahead for the header search: a few teams, players and competitions. Cached briefly at the edge.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
    if (q.length < 2) return NextResponse.json({teams: [], players: [], competitions: []});
    const r = await search(q);
    return NextResponse.json(
        {
            teams: r.teams.slice(0, 5).map((t) => ({name: t.name, slug: t.slug, logoUrl: t.logoUrl, hint: t.country})),
            players: r.players.slice(0, 5).map((p) => ({name: p.name, slug: p.slug, logoUrl: p.imageUrl, hint: p.team?.name ?? null})),
            competitions: r.competitions.slice(0, 4).map((c) => ({name: c.name, slug: c.slug, logoUrl: c.logoUrl, hint: c.country})),
        },
        {headers: {'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600'}},
    );
}
