import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {AuthFrame} from "@/components/auth/auth-frame";
import {SignInForm} from "@/components/auth/sign-in-form";
import {currentUser} from "@/lib/auth/user";
import {safeNext} from "@/lib/auth/next";

export const dynamic = 'force-dynamic';

interface Props {
    params: Promise<{locale: string}>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Account.signIn');
    return {title: t('title'), description: t('subtitle'), robots: {index: false}};
}

export default async function SignInPage({params, searchParams}: Props) {
    const {locale} = await params;
    const sp = await searchParams;
    setRequestLocale(locale);
    const next = safeNext(sp.next, locale);
    if (await currentUser()) redirect(next);
    const t = await getTranslations('Account.signIn');
    return (
        <AuthFrame footer={t('footer')}>
            <SignInForm next={next} initialError={sp.error === 'link' ? t('linkError') : null} />
        </AuthFrame>
    );
}
