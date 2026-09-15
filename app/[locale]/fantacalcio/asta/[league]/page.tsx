import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {AuctionBoard} from "@/components/fantasy/auction-board";
import {AUCTION_LEAGUES, isAuctionLeague, type AuctionLeague} from "@/lib/fantasy/config";
import {getAuctionPool} from "@/lib/fantasy/data";

// One static page per league, like the Serie A one at the plain address.
export const revalidate = 600;
export const dynamicParams = false;

export function generateStaticParams() {
    return AUCTION_LEAGUES.filter((l) => l.key !== 'serie-a').map((l) => ({league: l.key}));
}

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.auction');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function AuctionLeaguePage({params}: PageProps<"/[locale]/fantacalcio/asta/[league]">) {
    const {locale, league} = await params;
    setRequestLocale(locale);
    if (!isAuctionLeague(league)) notFound();
    const pool = await getAuctionPool(league as AuctionLeague);
    return (
        <SiteShell wide sidebar={false}>
            <AuctionBoard pool={pool} />
        </SiteShell>
    );
}
