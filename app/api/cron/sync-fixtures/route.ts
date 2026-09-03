import {NextRequest, NextResponse} from 'next/server';
import {isAuthorizedCron} from '@/lib/cron';

export const dynamic = 'force-dynamic';

/**
 * Placeholder for the fixtures sync job (Sportmonks -> football.fixtures).
 * The schedule is declared in vercel.json. The real sync lands in the next
 * step, once the Sportmonks trial token is available to test against.
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({error: 'unauthorized'}, {status: 401});
    }
    return NextResponse.json(
        {ok: false, job: 'sync-fixtures', status: 'not_implemented'},
        {status: 501},
    );
}
