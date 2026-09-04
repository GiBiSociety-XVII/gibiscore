import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.home');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function FantasyHome({params}: PageProps<"/[locale]/fantacalcio">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Fantasy.home');
    return (
        <SiteShell wide sidebar={false}>
            <PageHeader title={t('title')} meta={t('intro')} />
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 items-start">
                <Panel title={t('auctionTitle')}>
                    <div className="px-3 py-3 flex flex-col gap-3">
                        <p className="text-[13px] font-semibold">{t('auctionText')}</p>
                        <Link href="/fantacalcio/asta" className="bb-btn bg-accent px-4 h-10 inline-flex items-center self-start text-[13px] font-extrabold">{t('auctionCta')}</Link>
                    </div>
                </Panel>
                <Panel title={t('soonTitle')}>
                    <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('soonText')}</p>
                </Panel>
            </div>
        </SiteShell>
    );
}
