import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {SharedAuctionView} from "@/components/fantasy/shared-auction";
import {createPublicClient} from "@/lib/db/server";
import {isAuctionLeague, type AuctionLeague} from "@/lib/fantasy/config";
import {getAuctionPool} from "@/lib/fantasy/data";
import {parseShared} from "@/lib/fantasy/shared";

// Every visit reads the auction as it is now; the page then refreshes itself.
export const dynamic = 'force-dynamic';

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.shared');
    return {title: t('metaTitle'), robots: {index: false, follow: false}};
}

export default async function SharedAuctionPage({params}: {params: Promise<{locale: string; token: string}>}) {
    const {locale, token} = await params;
    setRequestLocale(locale);
    if (!TOKEN.test(token)) notFound();
    const {data} = await createPublicClient().rpc('shared_auction', {token});
    const row = Array.isArray(data) ? data[0] : data;
    const auction = row ? parseShared(row) : null;
    if (!auction || !isAuctionLeague(auction.league)) notFound();
    const pool = await getAuctionPool(auction.league as AuctionLeague);
    const t = await getTranslations('Fantasy.auction');
    return (
        <SiteShell wide sidebar={false}>
            {pool ? <SharedAuctionView pool={pool} token={token} initial={auction} /> : <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>}
        </SiteShell>
    );
}
