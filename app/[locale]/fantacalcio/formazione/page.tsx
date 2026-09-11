import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {LineupPlanner} from "@/components/fantasy/lineup-planner";
import {isAuctionLeague, type AuctionLeague} from "@/lib/fantasy/config";
import {getAuctionPool} from "@/lib/fantasy/data";
import {getMatchday} from "@/lib/fantasy/matchday-data";

// The matchday itself is cached ten minutes and refreshed when official lineups arrive.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.lineup');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function LineupPage({params, searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}) {
    const {locale} = await params;
    const sp = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations('Fantasy.lineup');
    const league: AuctionLeague = isAuctionLeague(typeof sp.league === 'string' ? sp.league : null) ? (sp.league as AuctionLeague) : 'serie-a';
    const [pool, context] = await Promise.all([getAuctionPool(league), getMatchday(league)]);
    return (
        <SiteShell wide sidebar={false}>
            <PageHeader title={t('title')} meta={t('intro')} />
            <LineupPlanner pool={pool} context={context} />
        </SiteShell>
    );
}
