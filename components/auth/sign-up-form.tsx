'use client';

import {Check, Loader2, Lock, Mail, UserRound} from "lucide-react";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Button} from "@/components/shared/ui/button";
import {createClient} from "@/lib/db/client";
import {localePath} from "@/lib/auth/next";
import {authErrorKey} from "@/lib/auth/errors";
import {Divider, Field, FormError, outlineLink} from "./field";

const USERNAME_MIN = 3;
const PASSWORD_MIN = 8;

/**
 * Name, email, password twice. The account is created from the browser
 * and is signed in at once (no e-mail confirmation): the home loads.
 */
export function SignUpForm({next, callback, locale}: {next: string; /** Absolute URL of the auth callback, with `next` already in it. */ callback: string; locale: string}) {
    const t = useTranslations('Account.signUp');
    const te = useTranslations('Account.errors');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [repeat, setRepeat] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const name = username.trim();
        if (name.length < USERNAME_MIN) return setError(t('errorUsernameMin', {min: USERNAME_MIN}));
        if (password !== repeat) return setError(t('errorPasswordMismatch'));
        if (password.length < PASSWORD_MIN) return setError(t('errorPasswordMin', {min: PASSWORD_MIN}));
        setLoading(true);
        try {
            const {error} = await createClient().auth.signUp({
                email: email.trim(),
                password,
                options: {emailRedirectTo: callback, data: {username: name, full_name: name}},
            });
            if (error) throw error;
            window.location.assign(localePath(locale, '/'));
        } catch (err) {
            setError(te(authErrorKey(err instanceof Error ? err.message : '')));
            setLoading(false);
        }
    };

    return (
        <>
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-foreground mb-2">{t('title')}</h1>
                <p className="font-semibold text-muted-foreground">{t('subtitle')}</p>
            </div>
            <form onSubmit={submit} className="space-y-5">
                <Field id="username" label={t('username')} icon={<UserRound />} type="text" autoComplete="nickname" placeholder={t('usernamePlaceholder')} hint={t('usernameHint', {min: USERNAME_MIN})} required minLength={USERNAME_MIN} maxLength={30} value={username} onChange={(e) => setUsername(e.target.value)} />
                <Field id="email" label={t('email')} icon={<Mail />} type="email" autoComplete="email" placeholder={t('emailPlaceholder')} required value={email} onChange={(e) => setEmail(e.target.value)} />
                <Field id="password" label={t('password')} icon={<Lock />} type="password" autoComplete="new-password" placeholder="••••••••" hint={t('passwordHint', {min: PASSWORD_MIN})} required minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)} />
                <Field id="repeat-password" label={t('repeatPassword')} icon={<Lock />} type="password" autoComplete="new-password" placeholder="••••••••" required minLength={PASSWORD_MIN} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
                {error && <FormError>{error}</FormError>}
                <div className="p-3 bg-muted rounded-[10px] border-2 border-foreground">
                    <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-foreground mt-0.5 shrink-0" aria-hidden="true" />
                        <p className="text-xs font-semibold text-foreground">{t('passwordStrong')}</p>
                    </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            {t('registering')}
                        </>
                    ) : (
                        t('createAccount')
                    )}
                </Button>
            </form>
            <Divider>{t('haveAccount')}</Divider>
            <Link href={{pathname: '/signin', query: {next}}} className={outlineLink}>
                {t('signIn')}
            </Link>
        </>
    );
}
