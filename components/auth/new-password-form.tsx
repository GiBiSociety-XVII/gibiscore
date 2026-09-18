'use client';

import {Loader2, Lock} from "lucide-react";
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Button} from "@/components/shared/ui/button";
import {createClient} from "@/lib/db/client";
import {authErrorKey} from "@/lib/auth/errors";
import {Divider, Field, FormError, outlineLink} from "./field";

const MIN = 8;

/** After the e-mail link: the new password, twice, on the recovery session the callback stored. */
export function NewPasswordForm() {
    const t = useTranslations('Account.password');
    const te = useTranslations('Account.errors');
    const [password, setPassword] = useState('');
    const [repeat, setRepeat] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [session, setSession] = useState<boolean | null>(null);

    useEffect(() => {
        let alive = true;
        try {
            createClient().auth.getSession().then(({data}) => { if (alive) setSession(!!data.session); }).catch(() => { if (alive) setSession(false); });
        } catch {
            queueMicrotask(() => setSession(false));
        }
        return () => { alive = false; };
    }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < MIN) { setError(t('tooShort', {min: MIN})); return; }
        if (password !== repeat) { setError(t('mismatch')); return; }
        setLoading(true);
        try {
            const {error} = await createClient().auth.updateUser({password});
            if (error) throw error;
            // A full load, so the server sees the session with the new password.
            window.location.assign(`${window.location.origin}/account`);
        } catch (err) {
            setError(te(authErrorKey(err instanceof Error ? err.message : '')));
            setLoading(false);
        }
    };

    if (session === false) {
        return (
            <div className="text-center">
                <h1 className="text-2xl font-extrabold text-foreground mb-2">{t('expiredTitle')}</h1>
                <p className="font-semibold text-muted-foreground mb-6">{t('expiredText')}</p>
                <Link href="/password" className={outlineLink}>{t('again')}</Link>
            </div>
        );
    }
    return (
        <>
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-foreground mb-2">{t('newTitle')}</h1>
                <p className="font-semibold text-muted-foreground">{t('newSubtitle')}</p>
            </div>
            <form onSubmit={submit} className="space-y-5">
                <Field id="password" label={t('newPassword')} icon={<Lock />} type="password" autoComplete="new-password" placeholder="••••••••" required minLength={MIN} hint={t('hint', {min: MIN})} value={password} onChange={(e) => setPassword(e.target.value)} />
                <Field id="repeat" label={t('repeat')} icon={<Lock />} type="password" autoComplete="new-password" placeholder="••••••••" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
                {error && <FormError>{error}</FormError>}
                <Button type="submit" disabled={loading || session === null} className="w-full">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{t('saving')}</> : t('save')}
                </Button>
            </form>
            <Divider>{t('remembered')}</Divider>
            <Link href="/signin" className={outlineLink}>{t('toSignIn')}</Link>
        </>
    );
}
