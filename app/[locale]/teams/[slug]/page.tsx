import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Badge} from "@/components/shared/ui/badge";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {MatchList} from "@/components/football/match-list";
import {NotFoundBox, PageHeader} from "@/components/football/page-header";
import {Tabs} from "@/components/football/tabs";
import {TeamCrest} from "@/components/football/team-crest";
import {getTeamPage} from "@/lib/football/data/teams";

export const revalidate = 120;

export async function generateMetadata({params}: PageProps<"/[locale]/teams/[slug]">): Promise<Metadata> {
    const {slug} = await params;
    const t = await getTranslations('Pages.team');
    const page = await getTeamPage(slug);
    if (!page) return {title: t('notFound')};
    return {title: page.team.name, description: t('metaDescription', {name: page.team.name})};
}

const POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'attacker'] as const;

export default async function TeamPage({params}: PageProps<"/[locale]/teams/[slug]">) {
    const {locale, slug} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.team');
    const tFootball = await getTranslations('Football');
    const page = await getTeamPage(slug);

    if (!page) {
        return (
            <SiteShell>
                <NotFoundBox message={t('notFound')} backHref="/competitions" backLabel="Competizioni" />
            </SiteShell>
        );
    }

    const {team} = page;
    const squadByPosition = POSITIONS.map((pos) => ({pos, players: page.squad.filter((p) => p.position === pos)}));
    const others = page.squad.filter((p) => !POSITIONS.includes(p.position as (typeof POSITIONS)[number]));

    const standingCards = page.standings.map((s) => (
        <Link key={`${s.competition.id}-${s.season.id}`} href={`/competitions/${s.competition.slug}`} className="flex items-center gap-3 px-3 h-12 border-t border-muted first:border-t-0 hover:bg-muted/60">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent font-mono text-base font-bold tabular-nums">{s.row.position}</span>
            <span className="flex flex-col min-w-0 leading-tight">
                <span className="text-[13px] font-extrabold truncate">{s.competition.name}</span>
                <span className="text-[11px] font-semibold text-muted-foreground">
                    {t('position', {position: s.row.position, total: s.totalTeams})} · {s.row.points} {tFootball('table.points').toLowerCase()} · {s.row.played} {tFootball('table.played').toLowerCase()}
                </span>
            </span>
        </Link>
    ));

    const rail = page.standings.length > 0 ? <Panel title={t('standings')}><div className="flex flex-col">{standingCards}</div></Panel> : undefined;

    const matchesTab = (
        <>
            {page.live.length > 0 && <MatchList title={t('live')} fixtures={page.live} highlightTeamId={team.id} showDate showCompetition />}
            <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
                <MatchList title={t('upcoming')} fixtures={page.upcoming} highlightTeamId={team.id} showDate showCompetition />
                <MatchList title={t('recent')} fixtures={page.recent} highlightTeamId={team.id} showDate showCompetition />
            </div>
        </>
    );

    const squadTab = (
        <div className="grid gap-3 grid-cols-1 xl:grid-cols-[7fr_5fr] items-start">
            <Panel title={t('squad')}>
                {page.squad.length === 0 ? (
                    <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{tFootball('empty.noSquad')}</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-muted">
                        {[...squadByPosition, {pos: 'unknown' as const, players: others}]
                            .filter((g) => g.players.length > 0)
                            .map((g) => (
                                <div key={g.pos} className="bg-card flex flex-col min-w-0">
                                    <h3 className="px-3 h-7 flex items-center text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground bg-muted/50">{tFootball(`positions.${g.pos}`)}</h3>
                                    <ul className="flex flex-col">
                                        {g.players.map((p) => (
                                            <li key={p.id} className="flex items-center gap-2 px-3 h-8 border-t border-muted first:border-t-0">
                                                <span className="font-mono text-[11px] font-bold tabular-nums w-5 text-right text-muted-foreground">{p.number ?? ''}</span>
                                                <Link href={`/players/${p.slug}`} className="font-bold text-[13px] truncate hover:underline decoration-accent decoration-[3px] underline-offset-2">{p.name}</Link>
                                                {p.age !== null && <span className="ml-auto text-[11px] font-semibold text-muted-foreground whitespace-nowrap">{p.age}</span>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                    </div>
                )}
            </Panel>
            <Panel title={t('sidelined')}>
                {page.sidelined.length === 0 ? (
                    <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">–</p>
                ) : (
                    <ul className="flex flex-col">
                        {page.sidelined.map((s) => (
                            <li key={s.player.id} className="flex items-center gap-3 px-3 h-8 border-t border-muted first:border-t-0">
                                <Link href={`/players/${s.player.slug}`} className="font-bold text-[13px] truncate hover:underline decoration-accent decoration-[3px] underline-offset-2">{s.player.name}</Link>
                                <Badge variant={s.category === 'suspension' ? 'ink' : 'outline'} className="ml-auto whitespace-nowrap">{s.description ?? s.category}</Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
        </div>
    );

    const standingsTab = <Panel title={t('standings')}>{page.standings.length === 0 ? <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{tFootball('empty.noStandings')}</p> : <div className="flex flex-col">{standingCards}</div>}</Panel>;

    return (
        <SiteShell rail={rail}>
            <PageHeader
                visual={<TeamCrest team={team} size={48} />}
                title={team.name}
                meta={[team.country, team.venue, team.founded ? t('founded', {year: team.founded}) : null].filter(Boolean).join(' · ')}
            />
            <Tabs
                items={[
                    {id: 'matches', label: t('tabs.matches'), content: matchesTab, count: page.live.length},
                    {id: 'squad', label: t('tabs.squad'), content: squadTab},
                    {id: 'standings', label: t('tabs.standings'), content: standingsTab},
                ]}
            />
        </SiteShell>
    );
}
