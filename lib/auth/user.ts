import 'server-only';
import {createClient} from '@/lib/db/server';

export interface SessionUser {
    id: string;
    email: string | null;
    /** The name chosen at sign-up, when there is one. */
    name: string | null;
}

/** The signed-in user of this request, verified against Supabase Auth; null for a visitor. */
export async function currentUser(): Promise<SessionUser | null> {
    try {
        const supabase = await createClient();
        const {data, error} = await supabase.auth.getUser();
        if (error || !data.user) return null;
        const meta = data.user.user_metadata as {username?: unknown} | undefined;
        return {id: data.user.id, email: data.user.email ?? null, name: typeof meta?.username === 'string' && meta.username.trim() ? meta.username.trim() : null};
    } catch {
        return null;
    }
}
