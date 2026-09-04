import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {FavoriteStar} from "@/components/football/favorite-star";
import {Flag} from "@/components/football/flag";
import {MatchList} from "@/components/football/match-list";
import {NotFoundBox, PageHeader} from "@/components/football/page-header";
import {ScorersPanel, StandingsPanel} from "@/components/football/rail";
import {Rankings} from "@/components/football/rankings";
import {SelectPanels} from "@/components/football/select-panels";
import {StandingsTable} from "@/components/football/standings-table";
import {Tabs} from "@/components/football/tabs";
import {getCompetitionPage} from "@/lib/football/data/competitions";
import {roundLabel} from "@/lib/football/data/shared";

export const revalidate = 120;

export async function generateMetadata({params}: PageProps<"/[locale]/competitions/[slug]">): Promise<Metadata> {
    const {slug} = await params;
    const t = await getTranslations('Pages.competition');
    const page = await getCompetitionPage(slug);
    if (!page) return {title: t('notFound')};
    return {title: page.competition.name, description: t('metaDescription', {name: page.competition.name, season: page.season?.name ?? ''})};
}

export default async function CompetitionPage({params}: PageProps<"/[locale]/competitions/[slug]">) {
    const {locale, slug} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.competition');
    const tFootball = await getTranslations('Football');
    const page = await getCompetitionPage(slug);

    if (!page) {
        return (
            <SiteShell>
                <NotFoundBox message={t('notFound')} backHref="/competitions" backLabel={t('backToList')} />
            </SiteShell>
        );
    }

    const {competition, season} = page;
    const rail = (
        <>
            {page.standings.length > 0 && <StandingsPanel title={t('standings')} slug={competition.slug} groups={page.standings.slice(0, 1)} />}
            {page.rankings.scorers.length > 0 && <ScorersPanel title={t('scorers')} players={page.rankings.scorers} />}
        </>
    );

    const matchesTab = (
        <>
            {page.live.length > 0 && <MatchList title={t('live')} fixtures={page.live} showDate />}
            {page.rounds.length === 0 ? (
                <MatchList fixtures={[]} />
            ) : (
                <SelectPanels
                    label={t('round')}
                    defaultId={page.currentRound ?? undefined}
                    panels={page.rounds.map((r) => ({id: r.round, label: roundLabel(r.round) || '—', content: <MatchList fixtures={r.fixtures} showDate />}))}
                />
            )}
        </>
    );

    const standingsTab = (
        <Panel title={`${t('standings')}${season ? ` · ${season.name}` : ''}`}>
            <StandingsTable groups={page.standings} />
        </Panel>
    );

    const playersTab = (
        <div className="grid gap-3 grid-cols-1 2xl:grid-cols-3">
            <Panel title={t('scorers')}><div className="px-1"><Rankings kind="scorers" players={page.rankings.scorers} /></div></Panel>
            <Panel title={t('assists')}><div className="px-1"><Rankings kind="assists" players={page.rankings.assists} /></div></Panel>
            <Panel title={t('ratings')}><div className="px-1"><Rankings kind="ratings" players={page.rankings.ratings} /></div></Panel>
        </div>
    );

    return (
        <SiteShell rail={rail}>
            <PageHeader
                visual={
                    <span className="inline-flex w-12 h-12 items-center justify-center rounded-xl border-[2.5px] border-foreground bg-card overflow-hidden">
                        {competition.logoUrl ? <Image src={competition.logoUrl} alt="" width={36} height={36} className="object-contain" /> : <Flag code={competition.countryCode} size={28} />}
                    </span>
                }
                title={competition.name}
                meta={
                    <>
                        <Flag code={competition.countryCode} size={14} />
                        {competition.country}
                        {season && <span>· {tFootball('labels.season', {season: season.name})}</span>}
                    </>
                }
                aside={
                    <span className="inline-flex items-center gap-2">
                        {page.live.length > 0 && <span className="bb-badge bg-accent">{t('live')} · {page.live.length}</span>}
                        <FavoriteStar slug={competition.slug} size={18} className="w-8 h-8 border-2 border-foreground bg-card" />
                    </span>
                }
            />
            <Tabs
                items={[
                    {id: 'matches', label: t('tabs.matches'), content: matchesTab, count: page.live.length},
                    {id: 'standings', label: t('tabs.standings'), content: standingsTab},
                    {id: 'players', label: t('tabs.players'), content: playersTab},
                ]}
            />
        </SiteShell>
    );
}
