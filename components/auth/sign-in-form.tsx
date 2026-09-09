'use client';

import {Loader2, Lock, Mail} from "lucide-react";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Button} from "@/components/shared/ui/button";
import {createClient} from "@/lib/db/client";
import {authErrorKey} from "@/lib/auth/errors";
import {Divider, Field, FormError, outlineLink} from "./field";

/** Email and password, signed in from the browser; a full load afterwards so the server sees the session. */
export function SignInForm({next, initialError = null}: {next: string; /** Shown before anything is typed (an expired e-mail link). */ initialError?: string | null}) {
    const t = useTranslations('Account.signIn');
    const te = useTranslations('Account.errors');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(initialError);
    const [loading, setLoading] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const {error} = await createClient().auth.signInWithPassword({email: email.trim(), password});
            if (error) throw error;
            window.location.assign(next);
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
                <Field id="email" label={t('email')} icon={<Mail />} type="email" autoComplete="email" placeholder={t('emailPlaceholder')} required value={email} onChange={(e) => setEmail(e.target.value)} />
                <Field id="password" label={t('password')} icon={<Lock />} type="password" autoComplete="current-password" placeholder="••••••••" required value={password} onChange={(e) => setPassword(e.target.value)} />
                {error && <FormError>{error}</FormError>}
                <Button type="submit" disabled={loading} className="w-full">
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            {t('signingIn')}
                        </>
                    ) : (
                        t('signIn')
                    )}
                </Button>
            </form>
            <Divider>{t('noAccount')}</Divider>
            <Link href={{pathname: '/signup', query: {next}}} className={outlineLink}>
                {t('createAccount')}
            </Link>
        </>
    );
}
