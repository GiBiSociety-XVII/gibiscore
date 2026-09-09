'use server';

import {redirect} from 'next/navigation';
import {createClient} from '@/lib/db/server';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gibiscore.com';

function field(form: FormData, name: string): string {
    const v = form.get(name);
    return typeof v === 'string' ? v.trim() : '';
}

function localeOf(form: FormData): string {
    const l = field(form, 'locale');
    return /^[a-z]{2}$/.test(l) ? l : 'it';
}

function nextOf(form: FormData, locale: string): string {
    const n = field(form, 'next');
    return n.startsWith('/') && !n.startsWith('//') ? n : `/${locale}/account`;
}

export async function signIn(form: FormData): Promise<void> {
    const locale = localeOf(form);
    const email = field(form, 'email');
    const password = field(form, 'password');
    if (!email || !password) redirect(`/${locale}/account?error=missing`);
    const supabase = await createClient();
    const {error} = await supabase.auth.signInWithPassword({email, password});
    if (error) redirect(`/${locale}/account?error=${error.message.toLowerCase().includes('confirm') ? 'unconfirmed' : 'credentials'}`);
    redirect(nextOf(form, locale));
}

export async function signUp(form: FormData): Promise<void> {
    const locale = localeOf(form);
    const email = field(form, 'email');
    const password = field(form, 'password');
    if (!email || password.length < 8) redirect(`/${locale}/account?error=weak&tab=register`);
    const supabase = await createClient();
    const next = nextOf(form, locale);
    const {data, error} = await supabase.auth.signUp({email, password, options: {emailRedirectTo: `${SITE}/api/auth/callback?next=${encodeURIComponent(next)}`}});
    if (error) redirect(`/${locale}/account?error=${error.message.toLowerCase().includes('registered') ? 'exists' : 'signup'}&tab=register`);
    // With e-mail confirmation off the session is already there; otherwise the link in the e-mail completes it.
    if (data.session) redirect(next);
    redirect(`/${locale}/account?notice=confirm`);
}

export async function signOut(form: FormData): Promise<void> {
    const locale = localeOf(form);
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect(`/${locale}/account?notice=out`);
}
