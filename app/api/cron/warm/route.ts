import {NextResponse, type NextRequest} from 'next/server';
import {isAuthorizedCron} from '@/lib/cron';
import {getAuctionPool} from '@/lib/fantasy/data';
import {getMatchday} from '@/lib/fantasy/matchday-data';
import {getScores, romeDate} from '@/lib/football/data/scores';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Every ten minutes: the heavy reads a visitor would otherwise pay for
 * (the fantasy pool and matchday of Serie A, today's scores) are built
 * here, so the shared data cache is warm after a deploy and stays warm.
 * No provider request: database only.
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) return NextResponse.json({error: 'unauthorized'}, {status: 401});
    const startedAt = Date.now();
    const results = await Promise.allSettled([getAuctionPool('serie-a'), getMatchday('serie-a'), getScores({mode: 'day', date: romeDate(new Date())})]);
    const status = results.map((r) => (r.status === 'fulfilled' ? (r.value ? 'ok' : 'empty') : 'failed'));
    return NextResponse.json({ok: status.every((s) => s === 'ok'), pool: status[0], matchday: status[1], scores: status[2], ms: Date.now() - startedAt});
}
