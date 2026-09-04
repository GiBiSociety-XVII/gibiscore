import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {LIVE_STATES, type FixtureSummary} from "@/lib/football/types";
import {TeamCrest} from "./team-crest";

export type RowState = 'live' | 'finished' | 'scheduled' | 'other';

export function rowState(fixture: Pick<FixtureSummary, 'state'>): RowState {
    if (LIVE_STATES.includes(fixture.state)) return 'live';
    if (fixture.state === 'finished') return 'finished';
    if (fixture.state === 'scheduled') return 'scheduled';
    return 'other';
}

/** Time / minute / short state, first column of a row. */
function StatusCell({fixture}: {fixture: FixtureSummary}) {
    const t = useTranslations('Football.statusShort');
    const format = useFormatter();
    switch (fixture.state) {
        case 'live':
        case 'extra_time':
            return <span className="text-accent-foreground bg-accent rounded px-1 font-mono font-extrabold tabular-nums">{fixture.minute !== null ? `${fixture.minute}'` : t('live')}</span>;
        case 'half_time':
            return <span className="bg-accent rounded px-1 font-extrabold">{t('halfTime')}</span>;
        case 'penalties':
            return <span className="bg-accent rounded px-1 font-extrabold">{t('penalties')}</span>;
        case 'finished':
            return <span className="text-muted-foreground font-bold">{t('finished')}</span>;
        case 'postponed':
            return <span className="text-muted-foreground font-bold">{t('postponed')}</span>;
        case 'cancelled':
            return <span className="text-muted-foreground font-bold">{t('cancelled')}</span>;
        case 'abandoned':
            return <span className="text-muted-foreground font-bold">{t('abandoned')}</span>;
        default:
            return <span className="font-mono font-bold tabular-nums">{format.dateTime(new Date(fixture.startingAt), {hour: '2-digit', minute: '2-digit'})}</span>;
    }
}

/**
 * One match per line, like a scores app: [time/minute] [home] [score] [away].
 * `showDate` adds the day before the time (team and player pages);
 * `showCompetition` adds the competition under the time (team pages).
 */
export function MatchRow({fixture, highlightTeamId, showDate = false, showCompetition = false, compact = false}: {fixture: FixtureSummary; highlightTeamId?: number; showDate?: boolean; showCompetition?: boolean; /** Narrow panels: three-letter codes and the year in the date. */ compact?: boolean}) {
    const format = useFormatter();
    const state = rowState(fixture);
    const isLive = state === 'live';
    const hasScore = fixture.homeScore !== null && fixture.awayScore !== null && fixture.state !== 'scheduled';
    const winner = hasScore && fixture.state === 'finished' ? (fixture.homeScore! > fixture.awayScore! ? 'home' : fixture.awayScore! > fixture.homeScore! ? 'away' : null) : null;

    const teamClass = (side: 'home' | 'away', id: number) =>
        cn(
            "truncate text-[13px]",
            winner === null || winner === side ? "font-bold" : "font-semibold text-foreground/70",
            highlightTeamId === id && "underline decoration-accent decoration-[3px] underline-offset-2",
        );

    return (
        <Link
            href={`/matches/${fixture.id}`}
            data-row={state}
            data-teams={`${fixture.home.slug ?? ''}|${fixture.away.slug ?? ''}`}
            className={cn(
                "grid items-center gap-1.5 px-2 min-h-8 border-t border-muted first:border-t-0 hover:bg-muted/70 transition-colors",
                showDate || showCompetition
                    ? "grid-cols-[78px_minmax(0,1fr)_52px_minmax(0,1fr)]"
                    : "grid-cols-[46px_minmax(0,1fr)_52px_minmax(0,1fr)] md:grid-cols-[52px_minmax(0,1fr)_56px_minmax(0,1fr)]",
                isLive && "bg-accent/10",
            )}
        >
            <span className="flex flex-col leading-tight text-[11px] min-w-0">
                {showDate && <span className="text-[10px] font-semibold text-muted-foreground">{format.dateTime(new Date(fixture.startingAt), compact ? {day: '2-digit', month: '2-digit', year: '2-digit'} : {day: '2-digit', month: '2-digit'})}</span>}
                <span className="inline-flex"><StatusCell fixture={fixture} /></span>
                {showCompetition && <span className="text-[10px] font-semibold text-muted-foreground truncate">{fixture.leagueName}</span>}
            </span>

            <span className="flex items-center justify-end gap-1.5 min-w-0">
                <span className={cn(teamClass('home', fixture.home.id), "text-right")} title={fixture.home.name}>{compact ? (fixture.home.shortCode ?? fixture.home.name) : fixture.home.name}</span>
                <TeamCrest team={fixture.home} size={18} />
            </span>

            <span className={cn("text-center font-mono font-extrabold tabular-nums text-[13px] rounded", isLive && "bg-accent")}>
                {hasScore ? `${fixture.homeScore} - ${fixture.awayScore}` : <span className="text-muted-foreground font-bold">-</span>}
            </span>

            <span className="flex items-center gap-1.5 min-w-0">
                <TeamCrest team={fixture.away} size={18} />
                <span className={teamClass('away', fixture.away.id)} title={fixture.away.name}>{compact ? (fixture.away.shortCode ?? fixture.away.name) : fixture.away.name}</span>
            </span>
        </Link>
    );
}
