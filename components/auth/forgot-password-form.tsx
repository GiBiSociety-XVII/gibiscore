'use client';

import {Loader2, Mail, MailCheck} from "lucide-react";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Button} from "@/components/shared/ui/button";
import {createClient} from "@/lib/db/client";
import {authErrorKey} from "@/lib/auth/errors";
import {Divider, Field, FormError, outlineLink} from "./field";

/** The e-mail, and Supabase sends the link; the link lands on the callback and continues to the new-password page. */
export function ForgotPasswordForm() {
    const t = useTranslations('Account.password');
    const te = useTranslations('Account.errors');
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const redirectTo = `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/password/nuova')}`;
            const {error} = await createClient().auth.resetPasswordForEmail(email.trim(), {redirectTo});
            if (error) throw error;
            setSent(true);
        } catch (err) {
            setError(te(authErrorKey(err instanceof Error ? err.message : '')));
        } finally {
            setLoading(false);
        }
    };

    if (sent) {
        return (
            <div className="text-center">
                <span className="inline-flex w-14 h-14 items-center justify-center rounded-full border-[2.5px] border-foreground bg-accent mb-4"><MailCheck className="w-7 h-7" aria-hidden="true" /></span>
                <h1 className="text-2xl font-extrabold text-foreground mb-2">{t('sentTitle')}</h1>
                <p className="font-semibold text-muted-foreground">{t('sentText', {email: email.trim()})}</p>
            </div>
        );
    }
    return (
        <>
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-foreground mb-2">{t('title')}</h1>
                <p className="font-semibold text-muted-foreground">{t('subtitle')}</p>
            </div>
            <form onSubmit={submit} className="space-y-5">
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
