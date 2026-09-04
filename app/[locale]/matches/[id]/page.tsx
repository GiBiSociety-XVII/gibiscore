import type {Metadata} from "next";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {EventsTimeline} from "@/components/football/events-timeline";
import {Flag} from "@/components/football/flag";
import {Lineups} from "@/components/football/lineups";
import {NotFoundBox} from "@/components/football/page-header";
import {PlayerMatchTable} from "@/components/football/player-match-table";
import {HeadToHeadPanel, StandingsPanel} from "@/components/football/rail";
import {StatusBadge} from "@/components/football/status-badge";
import {Tabs} from "@/components/football/tabs";
import {TeamCrest} from "@/components/football/team-crest";
import {TeamStats} from "@/components/football/team-stats";
import {getMatchPage} from "@/lib/football/data/matches";
import {roundLabel} from "@/lib/football/data/shared";
import {LIVE_STATES} from "@/lib/football/types";

export const revalidate = 60;

function parseId(raw: string): number | null {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({params}: PageProps<"/[locale]/matches/[id]">): Promise<Metadata> {
    const {id} = await params;
    const t = await getTranslations('Pages.match');
    const numeric = parseId(id);
    const page = numeric ? await getMatchPage(numeric) : null;
    if (!page) return {title: t('notFound')};
    const {fixture} = page;
    return {
        title: t('metaTitle', {home: fixture.home.name, away: fixture.away.name}),
        description: t('metaDescription', {home: fixture.home.name, away: fixture.away.name, competition: fixture.competition.name}),
    };
}

export default async function MatchPage({params}: PageProps<"/[locale]/matches/[id]">) {
    const {locale, id} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.match');
    const tFootball = await getTranslations('Football');
    const format = await getFormatter();
    const numeric = parseId(id);
    const page = numeric ? await getMatchPage(numeric) : null;

    if (!page) {
        return (
            <SiteShell>
                <NotFoundBox message={t('notFound')} backHref="/" backLabel={t('backToCompetition', {name: 'Live'})} />
            </SiteShell>
        );
    }

    const {fixture} = page;
    const hasScore = fixture.homeScore !== null && fixture.awayScore !== null && fixture.state !== 'scheduled';
    const isLive = LIVE_STATES.includes(fixture.state);
    const start = new Date(fixture.startingAt);
    const teamIds = [fixture.home.id, fixture.away.id];

    const rail = (
        <>
            {page.standings.length > 0 && <StandingsPanel title={fixture.competition.name} slug={fixture.competition.slug} groups={page.standings} highlightTeamIds={teamIds} />}
            <HeadToHeadPanel fixtures={page.headToHead} />
        </>
    );

    const summaryTab = (
        <>
            <EventsTimeline events={page.events} title={t('tabs.summary')} />
            <Panel title={t('info')}>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-2 text-[13px]">
                    <dt className="font-bold text-muted-foreground">{tFootball('labels.season', {season: ''}).trim()}</dt>
                    <dd className="font-semibold truncate">{fixture.competition.name}{fixture.round ? ` · ${roundLabel(fixture.round)}` : ''}</dd>
                    {fixture.venue && (<><dt className="font-bold text-muted-foreground">{tFootball('labels.venue')}</dt><dd className="font-semibold truncate">{fixture.venue}</dd></>)}
                    {fixture.referee && (<><dt className="font-bold text-muted-foreground">{tFootball('labels.referee')}</dt><dd className="font-semibold truncate">{fixture.referee}</dd></>)}
                </dl>
            </Panel>
        </>
    );

    return (
        <SiteShell rail={rail}>
            {/* Scoreboard */}
            <section className="bb-surface overflow-hidden">
                <div className="flex items-center gap-2 px-3 h-8 border-b-2 border-foreground bg-muted/60 text-[12px] font-extrabold">
                    <Flag code={fixture.competition.countryCode} logoUrl={fixture.competition.logoUrl} size={14} />
                    <Link href={`/competitions/${fixture.competition.slug}`} className="hover:underline decoration-accent decoration-[3px] underline-offset-2 truncate">
                        {fixture.competition.country ? `${fixture.competition.country} · ` : ''}{fixture.competition.name}
                    </Link>
                    {fixture.round && <span className="text-muted-foreground truncate">· {roundLabel(fixture.round)}</span>}
                    <span className="ml-auto text-muted-foreground whitespace-nowrap">{format.dateTime(start, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-4">
                    <Link href={`/teams/${fixture.home.slug}`} className="flex flex-col items-center gap-2 min-w-0 group">
                        <TeamCrest team={fixture.home} size={52} />
                        <span className="text-[13px] md:text-base font-extrabold text-center leading-tight group-hover:underline decoration-accent decoration-[3px] underline-offset-2">{fixture.home.name}</span>
                    </Link>
                    <div className="flex flex-col items-center gap-1 px-2">
                        <span className={cn("font-mono text-[40px] md:text-5xl font-bold tracking-tight tabular-nums leading-none px-2 rounded-lg", isLive && "bg-accent")}>
                            {hasScore ? `${fixture.homeScore}-${fixture.awayScore}` : <span className="text-muted-foreground text-3xl">{format.dateTime(start, {hour: '2-digit', minute: '2-digit'})}</span>}
                        </span>
                        <StatusBadge fixture={fixture} />
                        {fixture.homeScoreHt !== null && fixture.awayScoreHt !== null && (
                            <span className="text-[11px] font-bold text-muted-foreground">{tFootball('labels.halfTimeScore', {home: fixture.homeScoreHt, away: fixture.awayScoreHt})}</span>
                        )}
                    </div>
                    <Link href={`/teams/${fixture.away.slug}`} className="flex flex-col items-center gap-2 min-w-0 group">
                        <TeamCrest team={fixture.away} size={52} />
                        <span className="text-[13px] md:text-base font-extrabold text-center leading-tight group-hover:underline decoration-accent decoration-[3px] underline-offset-2">{fixture.away.name}</span>
                    </Link>
                </div>
            </section>

            <Tabs
                items={[
                    {id: 'summary', label: t('tabs.summary'), content: summaryTab, count: page.events.length},
                    {id: 'lineups', label: t('tabs.lineups'), content: <Lineups home={page.lineups.home} away={page.lineups.away} title={t('tabs.lineups')} />},
                    {id: 'stats', label: t('tabs.stats'), content: <TeamStats home={page.stats.home} away={page.stats.away} title={t('tabs.stats')} />},
                    {id: 'players', label: t('tabs.players'), content: <PlayerMatchTable home={page.players.home} away={page.players.away} homeTeam={fixture.home} awayTeam={fixture.away} title={t('players')} />},
                ]}
            />
        </SiteShell>
    );
}
