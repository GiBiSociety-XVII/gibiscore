import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {AuctionBoard} from "@/components/fantasy/auction-board";
import {isAuctionLeague} from "@/lib/fantasy/config";
import {getAuctionPool} from "@/lib/fantasy/data";

// Short enough that a page rendered while the pool was unavailable does not linger; the pool itself is cached for an hour.
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.auction');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function AuctionPage({params, searchParams}: PageProps<"/[locale]/fantacalcio/asta">) {
    const {locale} = await params;
    const sp = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations('Fantasy.auction');
    const league = isAuctionLeague(typeof sp.league === 'string' ? sp.league : null) ? (sp.league as Parameters<typeof getAuctionPool>[0]) : 'serie-a';
    const pool = await getAuctionPool(league);
    return (
        <SiteShell wide sidebar={false}>
            <PageHeader title={t('title')} meta={t('intro')} />
            <AuctionBoard pool={pool} />
        </SiteShell>
    );
}
