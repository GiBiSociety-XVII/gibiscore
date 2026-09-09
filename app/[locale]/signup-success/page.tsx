import type {Metadata} from "next";
import {CheckCircle} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {AuthFrame} from "@/components/auth/auth-frame";
import {SuccessRedirect} from "@/components/auth/success-redirect";
import {safeNext} from "@/lib/auth/next";

export const dynamic = 'force-dynamic';

interface Props {
    params: Promise<{locale: string}>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Account.success');
    return {title: t('title'), robots: {index: false}};
}

/** After sign-up with e-mail confirmation on: the account exists, the link in the e-mail opens it. */
export default async function SignUpSuccessPage({params, searchParams}: Props) {
    const {locale} = await params;
    const sp = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations('Account.success');
    const next = safeNext(sp.next, locale);
    return (
        <AuthFrame center>
            <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-[10px] border-2 border-foreground bg-accent flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-accent-foreground" aria-hidden="true" />
                </div>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground mb-3">{t('title')}</h1>
            <p className="font-semibold text-muted-foreground mb-6">{t('subtitle')}</p>
            <div className="p-4 bg-card border-2 border-foreground rounded-[10px] mb-6">
                <p className="text-sm font-semibold text-foreground">{t('redirecting')}</p>
            </div>
            <SuccessRedirect next={next} />
            <p className="text-xs font-semibold text-muted-foreground mt-6">{t('help')}</p>
        </AuthFrame>
    );
}
