import {after, NextResponse, type NextRequest} from 'next/server';
import {recordError} from '@/lib/errors/record';

export const dynamic = 'force-dynamic';

/**
 * What a page's error boundary caught in the browser. It is open, as it
 * must be (an error happens to signed-out visitors too), so nothing is
 * trusted: only a request the browser itself marks as coming from this
 * site is written down, the fields are cut to size, the same message
 * repeated is counted instead of stored again and the source has a
 * ceiling of rows per minute. The write happens after the answer, which
 * is always the same one.
 */
export async function POST(request: NextRequest) {
    try {
        // A browser sends this on a request its own page made; curl and the like do not.
        if (request.headers.get('sec-fetch-site') !== 'same-origin') return new NextResponse(null, {status: 204});
        const body = (await request.json()) as {message?: unknown; digest?: unknown; path?: unknown; locale?: unknown};
        const message = typeof body.message === 'string' ? body.message : '';
        if (message.length > 0) {
            const note = {
                source: 'client' as const,
                message,
                digest: typeof body.digest === 'string' ? body.digest : null,
                path: typeof body.path === 'string' ? body.path : null,
                locale: typeof body.locale === 'string' ? body.locale : null,
                userAgent: request.headers.get('user-agent'),
            };
            // The answer does not wait on the database: it is the database that may be the broken thing.
            after(() => recordError(note));
        }
    } catch {
        // A malformed body is not worth an answer of its own.
    }
    return new NextResponse(null, {status: 204});
}
