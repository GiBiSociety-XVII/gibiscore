import type {Metadata} from "next";
import {TrendingUp} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {NotFoundBox, PageHeader} from "@/components/football/page-header";
import {SchedinaTicket} from "@/components/football/schedina-ticket";
import {getSharedSchedina} from "@/lib/football/data/schedina-share";

// A shared slip changes as its matches end: read on request, kept out of the search engines.
export const dynamic = 'force-dynamic';

export async function generateMetadata({params}: PageProps<"/[locale]/schedine/[token]">): Promise<Metadata> {
    const {token} = await params;
    const t = await getTranslations('Pages.schedinaShare');
    const ticket = await getSharedSchedina(token);
    const status = !ticket ? '' : ticket.hit === null ? t('statusOpen') : ticket.hit ? t('statusWon') : t('statusLost');
    const title = ticket ? t('metaTitle', {id: ticket.id, status}) : t('title');
    return {title, description: t('metaDescription'), robots: {index: false, follow: false}, openGraph: {title, description: t('metaDescription')}};
}

/** A slip someone shared: the same ticket as in the profile, read-only, with the way to make one's own. */
export default async function SharedSchedinaPage({params}: PageProps<"/[locale]/schedine/[token]">) {
    const {locale, token} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.schedinaShare');
    const ticket = await getSharedSchedina(token);
    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={t('intro')} aside={<Link href="/predictions" className="bb-btn bg-accent px-3 h-8 inline-flex items-center gap-1.5 text-[12px] font-extrabold"><TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />{t('cta')}</Link>} />
            {ticket ? (
                <div className="grid grid-cols-1 md:grid-cols-2 items-start">
                    <SchedinaTicket ticket={ticket} shareToken={token} />
                </div>
            ) : (
                <NotFoundBox message={t('notFound')} backHref="/predictions" backLabel={t('cta')} />
            )}
        </SiteShell>
    );
}
