import {NextResponse, type NextRequest} from 'next/server';
import {recordError} from '@/lib/errors/record';

export const dynamic = 'force-dynamic';

/**
 * What a page's error boundary caught in the browser. Anyone can post
 * here (an error happens to signed-out visitors too), so nothing is
 * trusted: the fields are cut to size and the same message repeated is
 * counted, not stored again. The answer is always the same.
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {message?: unknown; digest?: unknown; path?: unknown; locale?: unknown};
        const message = typeof body.message === 'string' ? body.message : '';
        if (message.length > 0) {
            await recordError({
                source: 'client',
                message,
                digest: typeof body.digest === 'string' ? body.digest : null,
                path: typeof body.path === 'string' ? body.path : null,
                locale: typeof body.locale === 'string' ? body.locale : null,
                userAgent: request.headers.get('user-agent'),
            });
        }
    } catch {
        // A malformed body is not worth an answer of its own.
    }
    return new NextResponse(null, {status: 204});
}
