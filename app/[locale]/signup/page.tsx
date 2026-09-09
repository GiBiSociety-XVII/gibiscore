import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {AuthFrame} from "@/components/auth/auth-frame";
import {SignUpForm} from "@/components/auth/sign-up-form";
import {currentUser} from "@/lib/auth/user";
import {safeNext} from "@/lib/auth/next";

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gibiscore.com';

interface Props {
    params: Promise<{locale: string}>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Account.signUp');
    return {title: t('title'), description: t('subtitle'), robots: {index: false}};
}

export default async function SignUpPage({params, searchParams}: Props) {
    const {locale} = await params;
    const sp = await searchParams;
    setRequestLocale(locale);
    const next = safeNext(sp.next, locale);
    if (await currentUser()) redirect(next);
    const t = await getTranslations('Account.signUp');
    return (
        <AuthFrame footer={t('footer')}>
            <SignUpForm next={next} locale={locale} callback={`${SITE}/api/auth/callback?next=${encodeURIComponent(next)}`} />
        </AuthFrame>
    );
}
