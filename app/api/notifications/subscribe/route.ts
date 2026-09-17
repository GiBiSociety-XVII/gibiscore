import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/db/server';

export const dynamic = 'force-dynamic';

/**
 * A browser that said yes to notifications registers its Push API
 * subscription here (table push_subscriptions, RLS on the user); the
 * same endpoint moving to another account follows it. DELETE forgets it.
 */
export async function POST(request: NextRequest) {
    let body: {endpoint?: unknown; keys?: {p256dh?: unknown; auth?: unknown}; userAgent?: unknown};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({error: 'bad json'}, {status: 400});
    }
    const endpoint = typeof body.endpoint === 'string' && body.endpoint.startsWith('https://') ? body.endpoint.slice(0, 2000) : null;
    const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : null;
    const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : null;
    if (!endpoint || !p256dh || !auth) return NextResponse.json({error: 'bad subscription'}, {status: 400});
    const db = await createClient();
    const {data: who} = await db.auth.getUser();
    if (!who.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    // The endpoint is unique: a browser that changed account is moved, not duplicated.
    await db.from('push_subscriptions').delete().eq('endpoint', endpoint);
    const {error} = await db.from('push_subscriptions').insert({user_id: who.user.id, endpoint, p256dh, auth, user_agent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : null});
    if (error) return NextResponse.json({error: error.message}, {status: 500});
    return NextResponse.json({ok: true});
}

export async function DELETE(request: NextRequest) {
    let body: {endpoint?: unknown};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({error: 'bad json'}, {status: 400});
    }
    if (typeof body.endpoint !== 'string') return NextResponse.json({error: 'bad subscription'}, {status: 400});
    const db = await createClient();
    const {data: who} = await db.auth.getUser();
    if (!who.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    const {error} = await db.from('push_subscriptions').delete().eq('endpoint', body.endpoint);
    if (error) return NextResponse.json({error: error.message}, {status: 500});
    return NextResponse.json({ok: true});
}
