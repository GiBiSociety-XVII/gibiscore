import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/db/server';

export const dynamic = 'force-dynamic';

/** Whether the signed-in user muted this match (table muted_fixtures). */
export async function GET(request: NextRequest) {
    const fixtureId = Number(request.nextUrl.searchParams.get('fixtureId'));
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) return NextResponse.json({error: 'bad fixture'}, {status: 400});
    const db = await createClient();
    const {data: who} = await db.auth.getUser();
    if (!who.user) return NextResponse.json({error: 'signed out'}, {status: 401});
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
