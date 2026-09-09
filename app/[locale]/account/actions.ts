'use server';

import {redirect} from 'next/navigation';
import {localePath} from '@/lib/auth/next';
import {createClient} from '@/lib/db/server';

/** Ends the session and goes back to the sign-in page. */
export async function signOut(form: FormData): Promise<void> {
    const l = form.get('locale');
    const locale = typeof l === 'string' && /^[a-z]{2}$/.test(l) ? l : 'it';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect(localePath(locale, '/signin'));
}
