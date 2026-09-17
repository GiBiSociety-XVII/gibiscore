import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/db/server';
import {NOTIFICATION_KINDS, type NotificationKind} from '@/lib/notifications/events';

export const dynamic = 'force-dynamic';

export interface NotificationSettings {
    enabled: boolean;
    kinds: Record<NotificationKind, boolean>;
    /** Browsers subscribed on this account. */
    devices: number;
}

const allOn = () => Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as Record<NotificationKind, boolean>;

/** The user's switches (table notification_settings): everything, and each kind. Defaults: all on. */
export async function GET() {
    const db = await createClient();
    const {data: who} = await db.auth.getUser();
    if (!who.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    const [{data: row}, {count}] = await Promise.all([
        db.from('notification_settings').select('enabled,kinds').maybeSingle(),
        db.from('push_subscriptions').select('id', {count: 'exact', head: true}),
    ]);
    const kinds = allOn();
    for (const k of NOTIFICATION_KINDS) if (row?.kinds && (row.kinds as Record<string, unknown>)[k] === false) kinds[k] = false;
    const settings: NotificationSettings = {enabled: row ? row.enabled !== false : true, kinds, devices: count ?? 0};
    return NextResponse.json(settings);
}

export async function POST(request: NextRequest) {
    let body: {enabled?: unknown; kinds?: unknown};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({error: 'bad json'}, {status: 400});
    }
    const db = await createClient();
    const {data: who} = await db.auth.getUser();
    if (!who.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    const kinds = allOn();
    if (body.kinds && typeof body.kinds === 'object') for (const k of NOTIFICATION_KINDS) if ((body.kinds as Record<string, unknown>)[k] === false) kinds[k] = false;
    const {error} = await db.from('notification_settings').upsert({user_id: who.user.id, enabled: body.enabled !== false, kinds}, {onConflict: 'user_id'});
    if (error) return NextResponse.json({error: error.message}, {status: 500});
    return NextResponse.json({ok: true});
}
