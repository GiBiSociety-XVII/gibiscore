import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {LineupPlanner} from "@/components/fantasy/lineup-planner";
import {AUCTION_LEAGUES, isAuctionLeague, type AuctionLeague} from "@/lib/fantasy/config";
import {getAuctionPool} from "@/lib/fantasy/data";
import {getMatchday} from "@/lib/fantasy/matchday-data";

// One static page per league, like the Serie A one at the plain address.
export const revalidate = 60;
export const dynamicParams = false;

export function generateStaticParams() {
    return AUCTION_LEAGUES.filter((l) => l.key !== 'serie-a').map((l) => ({league: l.key}));
}

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.lineup');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function LineupLeaguePage({params}: PageProps<"/[locale]/fantacalcio/formazione/[league]">) {
    const {locale, league} = await params;
    setRequestLocale(locale);
    if (!isAuctionLeague(league)) notFound();
    const t = await getTranslations('Fantasy.lineup');
    const [pool, context] = await Promise.all([getAuctionPool(league as AuctionLeague), getMatchday(league as AuctionLeague)]);
    return (
        <SiteShell wide sidebar={false}>
            <PageHeader title={t('title')} />
            <LineupPlanner pool={pool} context={context ? {...context, history: []} : null} />
        </SiteShell>
    );
}
