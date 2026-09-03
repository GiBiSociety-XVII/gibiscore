import 'server-only';
import type {NextRequest} from 'next/server';

/**
 * Vercel Cron calls our routes with `Authorization: Bearer <CRON_SECRET>`.
 * Every cron route must refuse anything else, otherwise anyone could burn
 * the Sportmonks quota by hitting the URL.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    return request.headers.get('authorization') === `Bearer ${secret}`;
}
