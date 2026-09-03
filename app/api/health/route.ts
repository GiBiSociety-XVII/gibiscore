import {NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness probe for uptime checks and the Vercel deploy smoke test. */
export function GET() {
    return NextResponse.json({ok: true, service: 'gibiscore', time: new Date().toISOString()});
}
