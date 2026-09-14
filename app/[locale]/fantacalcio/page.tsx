import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {FantasyHome, type NextRound} from "@/components/fantasy/fantasy-home";
import {getMatchday} from "@/lib/fantasy/matchday-data";

// The round ahead moves once a week; the rest of the page is the device's own.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.home');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function FantasyHomePage({params}: PageProps<"/[locale]/fantacalcio">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Fantasy.home');
    const matchday = await getMatchday('serie-a');
    const info = matchday?.rounds.find((r) => r.round === matchday.round) ?? null;
    const round: NextRound | null = info ? {round: info.round, from: info.from, state: info.state} : null;
    return (
        <SiteShell wide sidebar={false}>
            <PageHeader title={t('title')} meta={t('intro')} />
            <FantasyHome round={round} />
        </SiteShell>
    );
}
