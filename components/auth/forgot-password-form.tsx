'use client';

import {KeyRound, Loader2, Lock, Mail} from "lucide-react";
import {useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Button} from "@/components/shared/ui/button";
import {createClient} from "@/lib/db/client";
import {authErrorKey} from "@/lib/auth/errors";
import {localePath} from "@/lib/auth/next";
import {Divider, Field, FormError, outlineLink} from "./field";

const MIN = 8;
/** The code in the e-mail: six digits by default, a few more if the project is set that way. */
const CODE = /^\d{6,10}$/;

/**
 * Forgot the password, as on gibiarena.com: the e-mail, then the code
 * that arrives with it typed here together with the new password. No
 * link to follow, so it works from any device and from a mail app that
 * opens links in its own browser; the code lasts an hour and works once
 * (supabase/templates/recovery.html).
 */
export function ForgotPasswordForm() {
    const t = useTranslations('Account.password');
    const te = useTranslations('Account.errors');
    const locale = useLocale();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [repeat, setRepeat] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    /** Asks Supabase for the code; `again` for the "send it again" link on the second step. */
    const send = async (again = false) => {
        setLoading(true);
        setError(null);
        setNotice(null);
        try {
            const {error} = await createClient().auth.resetPasswordForEmail(email.trim());
            if (error) throw error;
            setSent(true);
            if (again) setNotice(t('resent'));
        } catch (err) {
            setError(te(authErrorKey(err instanceof Error ? err.message : '')));
        } finally {
            setLoading(false);
        }
    };

    const submitEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        await send();
    };

    const submitCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setNotice(null);
        const token = code.replace(/\s+/g, '');
        if (!CODE.test(token)) { setError(t('codeInvalid')); return; }
        if (password.length < MIN) { setError(t('tooShort', {min: MIN})); return; }
        if (password !== repeat) { setError(t('mismatch')); return; }
        setLoading(true);
        try {
            const supabase = createClient();
            // The code opens a recovery session; the new password is set on it.
            const {error: verifyError} = await supabase.auth.verifyOtp({email: email.trim(), token, type: 'recovery'});
            if (verifyError) throw verifyError;
            const {error: updateError} = await supabase.auth.updateUser({password});
            if (updateError) throw updateError;
            // A full load, so the server sees the session with the new password.
            window.location.assign(`${window.location.origin}${localePath(locale, '/account')}`);
        } catch (err) {
            setError(te(authErrorKey(err instanceof Error ? err.message : '')));
            setLoading(false);
        }
    };

    if (sent) {
        return (
            <>
                <div className="mb-8">
                    <h1 className="text-3xl font-extrabold text-foreground mb-2">{t('codeTitle')}</h1>
                    <p className="font-semibold text-muted-foreground">{t('codeSubtitle', {email: email.trim()})}</p>
                </div>
                <form onSubmit={submitCode} className="space-y-5">
                    <Field id="code" label={t('code')} icon={<KeyRound />} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" placeholder="123456" required hint={t('codeHint')} value={code} onChange={(e) => setCode(e.target.value)} className="w-full pl-10 font-mono text-lg tracking-[0.3em]" />
                    <Field id="password" label={t('newPassword')} icon={<Lock />} type="password" autoComplete="new-password" placeholder="••••••••" required minLength={MIN} hint={t('hint', {min: MIN})} value={password} onChange={(e) => setPassword(e.target.value)} />
                    <Field id="repeat" label={t('repeat')} icon={<Lock />} type="password" autoComplete="new-password" placeholder="••••••••" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
                    {error && <FormError>{error}</FormError>}
                    {notice && <p role="status" className="text-sm font-semibold text-muted-foreground">{notice}</p>}
                    <Button type="submit" disabled={loading} className="w-full">
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{t('saving')}</> : t('save')}
                    </Button>
                </form>
                <p className="mt-4 text-center text-sm font-semibold text-muted-foreground">
                    {t('noCode')}{' '}
                    <button type="button" onClick={() => void send(true)} disabled={loading} className="font-bold text-foreground underline underline-offset-4 decoration-2 disabled:opacity-60">{t('resend')}</button>
                    {' · '}
                    <button type="button" onClick={() => { setSent(false); setCode(''); setError(null); setNotice(null); }} className="font-bold text-foreground underline underline-offset-4 decoration-2">{t('changeEmail')}</button>
                </p>
                <Divider>{t('remembered')}</Divider>
                <Link href="/signin" className={outlineLink}>{t('toSignIn')}</Link>
            </>
        );
    }
    return (
        <>
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-foreground mb-2">{t('title')}</h1>
                <p className="font-semibold text-muted-foreground">{t('subtitle')}</p>
            </div>
            <form onSubmit={submitEmail} className="space-y-5">
                <Field id="email" label={t('email')} icon={<Mail />} type="email" autoComplete="email" placeholder={t('emailPlaceholder')} required value={email} onChange={(e) => setEmail(e.target.value)} />
                {error && <FormError>{error}</FormError>}
                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{t('sending')}</> : t('send')}
                </Button>
            </form>
            <Divider>{t('remembered')}</Divider>
            <Link href="/signin" className={outlineLink}>{t('toSignIn')}</Link>
        </>
    );
}
