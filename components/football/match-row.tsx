import {useFormatter} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/home/team-crest";
import {LIVE_STATES, type FixtureSummary} from "@/lib/football/types";
import {StatusBadge} from "./status-badge";

/**
 * One line per match in lists (competition, team, live pages).
 * Layout: [status/time] [home name + crest] [score] [crest + away name].
 */
export function MatchRow({fixture, highlightTeamId, showCompetition = false}: {fixture: FixtureSummary; highlightTeamId?: number; showCompetition?: boolean}) {
    const format = useFormatter();
    const isLive = LIVE_STATES.includes(fixture.state);
    const hasScore = fixture.homeScore !== null && fixture.awayScore !== null && fixture.state !== 'scheduled';
    const start = new Date(fixture.startingAt);

    const teamClass = (id: number) => cn("font-bold text-[15px] truncate", highlightTeamId === id && "underline decoration-accent decoration-[3px] underline-offset-4");

    return (
        <Link
            href={`/matches/${fixture.id}`}
            className={cn(
                "grid grid-cols-[92px_minmax(0,1fr)_72px_minmax(0,1fr)] md:grid-cols-[120px_minmax(0,1fr)_88px_minmax(0,1fr)] items-center gap-2 md:gap-3 px-3 md:px-4 py-3 border-t-2 border-muted first:border-t-0 hover:bg-muted/60 transition-colors",
                isLive && "bg-accent/15",
            )}
        >
            <div className="flex flex-col gap-1 min-w-0">
                {isLive || fixture.state !== 'scheduled' ? (
                    <StatusBadge fixture={fixture} className="self-start" />
                ) : (
                    <span className="font-mono text-sm font-bold tabular-nums">{format.dateTime(start, {hour: '2-digit', minute: '2-digit'})}</span>
                )}
                <span className="text-[11px] font-semibold text-muted-foreground truncate">
                    {showCompetition ? fixture.leagueName : format.dateTime(start, {day: 'numeric', month: 'short'})}
                </span>
            </div>

            <div className="flex items-center justify-end gap-2 min-w-0">
                <span className={cn(teamClass(fixture.home.id), "text-right")}>{fixture.home.name}</span>
                <TeamCrest team={fixture.home} size={28} />
            </div>

            <div className="text-center font-mono font-bold tabular-nums text-lg md:text-xl">
                {hasScore ? `${fixture.homeScore} – ${fixture.awayScore}` : <span className="text-muted-foreground text-sm">vs</span>}
            </div>

            <div className="flex items-center gap-2 min-w-0">
                <TeamCrest team={fixture.away} size={28} />
                <span className={teamClass(fixture.away.id)}>{fixture.away.name}</span>
            </div>
        </Link>
    );
}
