import type {Metadata} from "next";
import {LogOut, Sparkles, UserRound} from "lucide-react";
import {redirect} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {AuthFrame} from "@/components/auth/auth-frame";
import {outlineLink} from "@/components/auth/field";
import {buttonClasses} from "@/components/shared/ui/button";
import {localePath} from "@/lib/auth/next";
import {currentUser} from "@/lib/auth/user";
import {signOut} from "./actions";

export const dynamic = 'force-dynamic';

interface Props {
    params: Promise<{locale: string}>;
}

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Account');
    return {title: t('title'), description: t('metaDescription'), robots: {index: false}};
}

/** The signed-in user's page: who he is, the way to the auction, the way out. Visitors go to sign in. */
export default async function AccountPage({params}: Props) {
    const {locale} = await params;
    setRequestLocale(locale);
    const user = await currentUser();
    if (!user) redirect(localePath(locale, `/signin?next=${encodeURIComponent(localePath(locale, '/account'))}`));
    const t = await getTranslations('Account');
    return (
        <AuthFrame footer={t('intro')}>
            <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-[10px] border-2 border-foreground bg-accent flex items-center justify-center shrink-0">
                    <UserRound className="w-7 h-7 text-accent-foreground" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <h1 className="text-2xl font-extrabold text-foreground truncate">{user.name ?? t('title')}</h1>
                    <p className="text-sm font-semibold text-muted-foreground truncate">{user.email}</p>
                </div>
            </div>
            <div className="space-y-3">
                <Link href="/fantacalcio/asta" className={buttonClasses('primary', 'default', 'w-full')}>
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    {t('toAuction')}
                </Link>
                <form action={signOut}>
                    <input type="hidden" name="locale" value={locale} />
                    <button type="submit" className={`${outlineLink} inline-flex items-center justify-center gap-2`}>
                        <LogOut className="w-4 h-4" aria-hidden="true" />
                        {t('signOut')}
                    </button>
                </form>
            </div>
        </AuthFrame>
    );
}
