import type {Metadata} from "next";
import {BarChart3, ClipboardList, Sparkles, TrendingUp, UserRound} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link, redirect} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {MySchedine} from "@/components/football/my-schedine";
import {currentUser} from "@/lib/auth/user";

// Who is signed in decides the page: never cached, never indexed.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Account.profile');
    return {title: t('metaTitle'), robots: {index: false}};
}

/** The signed-in user's own page: who they are, the way to their things, their slips as tickets. */
export default async function AccountPage({params}: PageProps<"/[locale]/account">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const user = await currentUser();
    if (!user) redirect({href: {pathname: '/signin', query: {next: '/account'}}, locale});
    const t = await getTranslations('Account.profile');
    const links = [
        {key: 'auction', href: '/fantacalcio/asta' as const, Icon: Sparkles},
        {key: 'lineup', href: '/fantacalcio/formazione' as const, Icon: ClipboardList},
        {key: 'predictions', href: '/predictions' as const, Icon: TrendingUp},
        {key: 'record', href: '/predictions/record' as const, Icon: BarChart3},
    ];
    return (
        <SiteShell wide>
            <PageHeader
                visual={<span className="w-11 h-11 rounded-lg border-2 border-foreground bg-accent flex items-center justify-center shrink-0"><UserRound className="w-5 h-5" aria-hidden="true" /></span>}
                title={user!.name ?? t('title')}
                meta={user!.email ?? t('intro')}
            />
            <div className="flex flex-wrap items-center gap-2">
                {links.map(({key, href, Icon}) => (
                    <Link key={key} href={href} className="bb-btn bg-card h-9 px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" aria-hidden="true" />{t(`links.${key}`)}</Link>
                ))}
            </div>
            <MySchedine title={t('schedine')} />
            <p className="text-[12px] font-semibold text-muted-foreground">{t('schedineHint')}</p>
        </SiteShell>
    );
}
