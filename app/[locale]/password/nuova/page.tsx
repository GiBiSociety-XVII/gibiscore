import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {AuthFrame} from "@/components/auth/auth-frame";
import {NewPasswordForm} from "@/components/auth/new-password-form";

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Account.password');
    return {title: t('newTitle'), robots: {index: false}};
}

/** Where the reset link lands (through the callback): the new password. */
export default async function NewPasswordPage({params}: PageProps<"/[locale]/password/nuova">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Account.password');
    return (
        <AuthFrame footer={t('footer')}>
            <NewPasswordForm />
        </AuthFrame>
    );
}
