import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/db/server';

export const dynamic = 'force-dynamic';

export interface MutedMatch {
    fixtureId: number;
    home: string;
    away: string;
    startingAt: string;
}

/** With `fixtureId`: whether the signed-in user muted this match. Without: every match muted, with names (table muted_fixtures). */
export async function GET(request: NextRequest) {
    const raw = request.nextUrl.searchParams.get('fixtureId');
    const db = await createClient();
    const {data: who} = await db.auth.getUser();
    if (!who.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    if (raw === null) {
        const {data} = await db.from('muted_fixtures').select('fixture_id,fixture:fixtures(starting_at,home:teams!fixtures_home_team_id_fkey(name),away:teams!fixtures_away_team_id_fkey(name))').order('created_at', {ascending: false}).limit(50);
        const list: MutedMatch[] = ((data ?? []) as unknown as Array<{fixture_id: number; fixture: {starting_at: string; home: {name: string} | null; away: {name: string} | null} | null}>).map((r) => ({fixtureId: r.fixture_id, home: r.fixture?.home?.name ?? '?', away: r.fixture?.away?.name ?? '?', startingAt: r.fixture?.starting_at ?? ''}));
        return NextResponse.json({muted: list});
    }
    const fixtureId = Number(raw);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) return NextResponse.json({error: 'bad fixture'}, {status: 400});
    const {data} = await db.from('muted_fixtures').select('fixture_id').eq('fixture_id', fixtureId).maybeSingle();
    return NextResponse.json({muted: !!data});
}

/** Mute or unmute one match: no notification about it, whatever the favourites say. */
export async function POST(request: NextRequest) {
    let body: {fixtureId?: unknown; muted?: unknown};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({error: 'bad json'}, {status: 400});
    }
    const fixtureId = Number(body.fixtureId);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) return NextResponse.json({error: 'bad fixture'}, {status: 400});
    const db = await createClient();
    const {data: who} = await db.auth.getUser();
    if (!who.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    const {error} = body.muted === false
        ? await db.from('muted_fixtures').delete().eq('fixture_id', fixtureId)
        : await db.from('muted_fixtures').upsert({user_id: who.user.id, fixture_id: fixtureId}, {onConflict: 'user_id,fixture_id', ignoreDuplicates: true});
    if (error) return NextResponse.json({error: error.message}, {status: 500});
    return NextResponse.json({muted: body.muted !== false});
}
