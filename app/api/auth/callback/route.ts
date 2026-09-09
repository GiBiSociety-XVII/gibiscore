import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/db/server';

/**
 * Where the links in Supabase's e-mails land (sign-up confirmation,
 * password reset): the one-time code is exchanged for a session, stored
 * in cookies, and the user continues where he was going.
 */
export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');
    const next = request.nextUrl.searchParams.get('next') ?? '/it/account';
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/it/account';
    if (code) {
        const supabase = await createClient();
        const {error} = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
        return NextResponse.redirect(new URL(`/it/account?error=link`, request.url));
    }
    return NextResponse.redirect(new URL('/it/account?error=link', request.url));
}
