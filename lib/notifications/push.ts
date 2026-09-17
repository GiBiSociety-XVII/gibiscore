import 'server-only';
import webpush from 'web-push';

/**
 * The Web Push door: one message to one browser, signed with the site's
 * VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT). Without the keys nothing is sent and nobody is asked
 * to subscribe.
 */
export interface PushTarget {
    endpoint: string;
    p256dh: string;
    auth: string;
}

export interface PushPayload {
    title: string;
    body: string;
    /** Where a tap goes, a path on the site. */
    url: string;
    /** Notifications with the same tag replace one another on the device. */
    tag: string;
    kind: string;
}

let configured: boolean | null = null;

export function pushConfigured(): boolean {
    if (configured !== null) return configured;
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
        configured = false;
        return false;
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:service@gibiscore.com', pub, priv);
    configured = true;
    return true;
}

/** ok: delivered to the push service; gone: the browser unsubscribed, drop the row; error: try again next time. */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<'ok' | 'gone' | 'error'> {
    if (!pushConfigured()) return 'error';
    try {
        await webpush.sendNotification({endpoint: target.endpoint, keys: {p256dh: target.p256dh, auth: target.auth}}, JSON.stringify(payload), {TTL: 600, urgency: 'high'});
        return 'ok';
    } catch (error) {
        const status = (error as {statusCode?: number}).statusCode;
        if (status === 404 || status === 410) return 'gone';
        console.warn(`[push] ${status ?? '?'} ${(error as Error).message}`);
        return 'error';
    }
}
