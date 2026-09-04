import type {Metadata} from "next";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {AutoRefresh} from "@/components/football/auto-refresh";
import {EventsTimeline} from "@/components/football/events-timeline";
import {Flag} from "@/components/football/flag";
import {FormStrip} from "@/components/football/form-strip";
import {Lineups} from "@/components/football/lineups";
import {MatchStudy} from "@/components/football/match-study";
import {AbsenceList} from "@/components/football/absences";
import {PredictionPanel} from "@/components/football/prediction";
import {predictMatch} from "@/lib/football/prediction";
import {getSeasonStudy} from "@/lib/football/data/study";
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

export const revalidate = 20;

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
    const study = fixture.seasonId ? await getSeasonStudy(fixture.seasonId) : null;
    const prediction = predictMatch(study, fixture.home.id, fixture.away.id);
    const hasAbsences = page.absences.home.length > 0 || page.absences.away.length > 0;
    const hasScore = fixture.homeScore !== null && fixture.awayScore !== null && fixture.state !== 'scheduled';
    const isLive = LIVE_STATES.includes(fixture.state);
    const start = new Date(fixture.startingAt);
    const teamIds = [fixture.home.id, fixture.away.id];

    // Goal lines under the scoreboard: "Lautaro 23', 67' (rig.)".
    const goalEvents = page.events.filter((e) => e.type === 'goal' || e.type === 'penalty' || e.type === 'own_goal');
    const scorersOf = (side: 'home' | 'away') => {
        const map = new Map<string, {name: string; slug: string | null; minutes: string[]}>();
        for (const e of goalEvents) {
            // An own goal counts for the other side.
            const creditedSide = e.type === 'own_goal' ? (e.side === 'home' ? 'away' : 'home') : e.side;
            if (creditedSide !== side) continue;
            const name = e.player.name ?? '?';
            const key = e.player.id ? String(e.player.id) : name;
            if (!map.has(key)) map.set(key, {name, slug: e.player.slug, minutes: []});
            map.get(key)!.minutes.push(`${e.minute ?? ''}${e.extraMinute ? `+${e.extraMinute}` : ''}'${e.type === 'penalty' ? ' rig.' : e.type === 'own_goal' ? ' aut.' : ''}`);
        }
        return [...map.values()];
    };
    const homeScorers = scorersOf('home');
    const awayScorers = scorersOf('away');
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: `${fixture.home.name} - ${fixture.away.name}`,
        startDate: fixture.startingAt,
        eventStatus: isLive ? 'https://schema.org/EventScheduled' : fixture.state === 'postponed' ? 'https://schema.org/EventPostponed' : fixture.state === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
        homeTeam: {'@type': 'SportsTeam', name: fixture.home.name},
        awayTeam: {'@type': 'SportsTeam', name: fixture.away.name},
        location: fixture.venue ? {'@type': 'Place', name: fixture.venue} : undefined,
        organizer: {'@type': 'Organization', name: fixture.competition.name},
        sport: 'Soccer',
    };

    const rail = (
        <>
            {page.standings.length > 0 && <StandingsPanel title={fixture.competition.name} slug={fixture.competition.slug} groups={page.standings} highlightTeamIds={teamIds} />}
            <HeadToHeadPanel fixtures={page.headToHead} teamId={fixture.home.id} />
        </>
    );

    const rowOf = (teamId: number) => page.standings.flatMap((g) => g.rows).find((r) => r.team.id === teamId) ?? null;
    const homeRow = rowOf(fixture.home.id);
    const awayRow = rowOf(fixture.away.id);
    const comparison = (homeRow || awayRow || page.form.home.length > 0 || page.form.away.length > 0) && (
        <Panel title={t('comparison')}>
            <table className="w-full text-[13px]">
                <tbody>
                    {[
                        {label: t('form'), home: <FormStrip entries={page.form.home} />, away: <FormStrip entries={page.form.away} />},
                        {label: t('position'), home: homeRow ? `${homeRow.position}ª` : '–', away: awayRow ? `${awayRow.position}ª` : '–'},
                        {label: t('points'), home: homeRow?.points ?? '–', away: awayRow?.points ?? '–'},
                        {label: t('goals'), home: homeRow ? `${homeRow.goalsFor ?? 0} / ${homeRow.goalsAgainst ?? 0}` : '–', away: awayRow ? `${awayRow.goalsFor ?? 0} / ${awayRow.goalsAgainst ?? 0}` : '–'},
                    ].map((line) => (
                        <tr key={line.label} className="border-t border-muted first:border-t-0">
                            <td className="px-3 py-1.5 w-1/3 text-right font-mono font-extrabold tabular-nums">{line.home}</td>
                            <td className="px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{line.label}</td>
                            <td className="px-3 py-1.5 w-1/3 text-left font-mono font-extrabold tabular-nums">{line.away}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Panel>
    );

    const summaryTab = (
        <>
            {comparison}
            <PredictionPanel prediction={prediction} home={fixture.home} away={fixture.away} title={fixture.state === 'scheduled' ? t('prediction') : undefined} />
            {hasAbsences && (
                <Panel title={t('absences')}>
                    <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-muted">
                        {(['home', 'away'] as const).map((side) => (
                            <div key={side} className="min-w-0">
                                <div className="px-3 h-7 flex items-center text-[11px] font-extrabold uppercase tracking-wide border-b border-muted bg-muted/40">{fixture[side].name}</div>
                                <AbsenceList entries={page.absences[side]} compact />
                            </div>
                        ))}
                    </div>
                </Panel>
            )}
            <MatchStudy study={study} homeId={fixture.home.id} awayId={fixture.away.id} />
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
            <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}} />
            <AutoRefresh seconds={20} enabled={isLive} aroundIso={fixture.state === 'scheduled' ? fixture.startingAt : undefined} />
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
                {(homeScorers.length > 0 || awayScorers.length > 0) && (
                    <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] gap-2 px-3 pb-2 -mt-1 text-[11px] font-semibold text-muted-foreground">
                        <ul className="flex flex-col items-end text-right">
                            {homeScorers.map((s) => (
                                <li key={s.name} className="truncate max-w-full">
                                    {s.slug ? <Link href={`/players/${s.slug}`} className="text-foreground hover:underline decoration-accent decoration-2 underline-offset-2">{s.name}</Link> : <span className="text-foreground">{s.name}</span>} <span className="font-mono">{s.minutes.join(', ')}</span>
                                </li>
                            ))}
                        </ul>
                        <span className="text-center" aria-hidden="true">⚽︎</span>
                        <ul className="flex flex-col items-start">
                            {awayScorers.map((s) => (
                                <li key={s.name} className="truncate max-w-full">
                                    <span className="font-mono">{s.minutes.join(', ')}</span> {s.slug ? <Link href={`/players/${s.slug}`} className="text-foreground hover:underline decoration-accent decoration-2 underline-offset-2">{s.name}</Link> : <span className="text-foreground">{s.name}</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {(page.form.home.length > 0 || page.form.away.length > 0 || page.bestPlayer) && (
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 px-3 pb-2.5 -mt-1">
                        <span className="flex justify-center"><FormStrip entries={page.form.home} /></span>
                        <span className="flex justify-center md:order-3"><FormStrip entries={page.form.away} /></span>
                        {page.bestPlayer && (
                            <span className="col-span-2 md:col-span-1 md:order-2 text-[11px] font-bold text-muted-foreground text-center leading-snug min-w-0">
                                <Link href={`/players/${page.bestPlayer.player.slug}`} className="inline-flex flex-wrap items-center justify-center gap-x-1 hover:underline decoration-accent decoration-[2px] underline-offset-2">
                                    <span className="whitespace-nowrap">{t('bestPlayer')}:</span>
                                    <span className="text-foreground">{page.bestPlayer.player.name}</span>
                                    <span className="font-mono bg-accent px-1 rounded text-foreground">{page.bestPlayer.rating?.toFixed(1)}</span>
                                </Link>
                            </span>
                        )}
                    </div>
                )}
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
