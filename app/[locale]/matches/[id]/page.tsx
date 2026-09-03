import type {Metadata} from "next";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {TeamCrest} from "@/components/home/team-crest";
import {EventsTimeline} from "@/components/football/events-timeline";
import {Lineups} from "@/components/football/lineups";
import {NotFoundBox, PageShell} from "@/components/football/page-shell";
import {PlayerMatchTable} from "@/components/football/player-match-table";
import {StatusBadge} from "@/components/football/status-badge";
import {TeamStats} from "@/components/football/team-stats";
import {getMatchPage} from "@/lib/football/data/matches";
import {roundLabel} from "@/lib/football/data/shared";

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
            <PageShell>
                <NotFoundBox message={t('notFound')} backHref="/live" backLabel={t('backToCompetition', {name: 'Live'})} />
            </PageShell>
        );
    }

    const {fixture} = page;
    const hasScore = fixture.homeScore !== null && fixture.awayScore !== null && fixture.state !== 'scheduled';
    const start = new Date(fixture.startingAt);

    return (
        <PageShell>
            <div className="flex items-center justify-between gap-3 text-sm font-bold">
                <Link href={`/competitions/${fixture.competition.slug}`} className="hover:underline decoration-accent decoration-[3px] underline-offset-4">
                    ← {t('backToCompetition', {name: fixture.competition.name})}
                </Link>
                <span className="text-muted-foreground">{roundLabel(fixture.round)}</span>
            </div>

            {/* Scoreboard */}
            <Card press className="p-5 md:p-8 flex flex-col gap-5">
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">
                    <span>{format.dateTime(start, {weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'})}</span>
                    <StatusBadge fixture={fixture} />
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-6">
                    <Link href={`/teams/${fixture.home.slug}`} className="flex flex-col items-center gap-3 min-w-0 group">
                        <TeamCrest team={fixture.home} size={72} />
                        <span className="text-lg md:text-2xl font-extrabold text-center truncate max-w-full group-hover:underline decoration-accent decoration-[3px] underline-offset-4">{fixture.home.name}</span>
                    </Link>
                    <div className="flex flex-col items-center gap-1">
                        <span className="font-mono text-5xl md:text-7xl font-bold tracking-tight tabular-nums">
                            {hasScore ? `${fixture.homeScore} – ${fixture.awayScore}` : <span className="text-muted-foreground text-4xl">vs</span>}
                        </span>
                        {fixture.homeScoreHt !== null && fixture.awayScoreHt !== null && (
                            <span className="text-xs font-bold text-muted-foreground">{tFootball('labels.halfTimeScore', {home: fixture.homeScoreHt, away: fixture.awayScoreHt})}</span>
                        )}
                    </div>
                    <Link href={`/teams/${fixture.away.slug}`} className="flex flex-col items-center gap-3 min-w-0 group">
                        <TeamCrest team={fixture.away} size={72} />
                        <span className="text-lg md:text-2xl font-extrabold text-center truncate max-w-full group-hover:underline decoration-accent decoration-[3px] underline-offset-4">{fixture.away.name}</span>
                    </Link>
                </div>
                {(fixture.venue || fixture.referee) && (
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs font-semibold text-muted-foreground border-t-2 border-muted pt-4">
                        {fixture.venue && <span>{tFootball('labels.venue')}: {fixture.venue}</span>}
                        {fixture.referee && <span>{tFootball('labels.referee')}: {fixture.referee}</span>}
                    </div>
                )}
            </Card>

            <div className="grid gap-6 grid-cols-1 xl:grid-cols-[5fr_7fr] items-start">
                <div className="flex flex-col gap-6 min-w-0">
                    <EventsTimeline events={page.events} title={t('events')} />
                    <TeamStats home={page.stats.home} away={page.stats.away} title={t('stats')} />
                </div>
                <div className="flex flex-col gap-6 min-w-0">
                    <Lineups home={page.lineups.home} away={page.lineups.away} title={t('lineups')} />
                </div>
            </div>

            <PlayerMatchTable home={page.players.home} away={page.players.away} homeTeam={fixture.home} awayTeam={fixture.away} title={t('players')} />
        </PageShell>
    );
}
