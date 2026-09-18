import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {AuthFrame} from "@/components/auth/auth-frame";
import {ForgotPasswordForm} from "@/components/auth/forgot-password-form";

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Account.password');
    return {title: t('title'), robots: {index: false}};
}

/** "Forgot the password": the e-mail, then the link. */
export default async function ForgotPasswordPage({params}: PageProps<"/[locale]/password">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Account.password');
    return (
        <AuthFrame footer={t('footer')}>
            <ForgotPasswordForm />
        </AuthFrame>
    );
}
