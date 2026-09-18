'use client';

/**
 * The browser side of the notifications: whether this device can
 * receive them, subscribing it (permission, service worker, Push API,
 * then the subscription to the account) and letting it go.
 */
export type PushSupport =
    | 'ok'
    /** Safari on iPhone and iPad only pushes to a site added to the Home Screen. */
    | 'ios-install'
    | 'unsupported'
    /** No public key on the site: nothing to subscribe to. */
    | 'not-configured';

export const KINDS = ['reminder', 'lineups', 'kickoff', 'goal', 'red_card', 'half_time', 'full_time', 'digest', 'schedina'] as const;

export function pushSupport(): PushSupport {
    if (typeof window === 'undefined') return 'unsupported';
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'not-configured';
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    const standalone = (navigator as Navigator & {standalone?: boolean}).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const able = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!able) return ios && !standalone ? 'ios-install' : 'unsupported';
    return 'ok';
}

function serverKey(): Uint8Array {
    const base64 = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob(padded);
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The Push API subscription of this browser, when it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    return reg ? reg.pushManager.getSubscription() : null;
}

/** Asks the permission, registers the worker, subscribes and tells the account. */
export async function subscribePush(): Promise<'ok' | 'denied' | 'error'> {
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return 'denied';
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: serverKey() as BufferSource}));
        const json = sub.toJSON();
        const res = await fetch('/api/notifications/subscribe', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent})});
        return res.ok ? 'ok' : 'error';
    } catch {
        return 'error';
    }
}

/** Forgets this browser: the account row, then the Push API subscription. */
export async function unsubscribePush(): Promise<void> {
    const sub = await currentSubscription();
    if (!sub) return;
    try {
        await fetch('/api/notifications/subscribe', {method: 'DELETE', headers: {'content-type': 'application/json'}, body: JSON.stringify({endpoint: sub.endpoint})});
    } finally {
        await sub.unsubscribe().catch(() => undefined);
    }
}
