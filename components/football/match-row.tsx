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

    const teamClass = (id: number) => cn("font-bold text-[13px] truncate", highlightTeamId === id && "underline decoration-accent decoration-[3px] underline-offset-4");

    return (
        <Link
            href={`/matches/${fixture.id}`}
            className={cn(
                "grid grid-cols-[72px_minmax(0,1fr)_64px_minmax(0,1fr)] md:grid-cols-[96px_minmax(0,1fr)_76px_minmax(0,1fr)] items-center gap-2 px-2.5 md:px-3 py-1.5 border-t-2 border-muted first:border-t-0 hover:bg-muted/60 transition-colors",
                isLive && "bg-accent/15",
            )}
        >
            <div className="flex flex-col gap-1 min-w-0">
                {isLive || fixture.state !== 'scheduled' ? (
                    <StatusBadge fixture={fixture} className="self-start" />
                ) : (
                    <span className="font-mono text-[13px] font-bold tabular-nums">{format.dateTime(start, {hour: '2-digit', minute: '2-digit'})}</span>
                )}
                <span className="text-[10px] font-semibold text-muted-foreground truncate">
                    {showCompetition ? fixture.leagueName : format.dateTime(start, {day: 'numeric', month: 'short'})}
                </span>
            </div>

            <div className="flex items-center justify-end gap-2 min-w-0">
                <span className={cn(teamClass(fixture.home.id), "text-right")}>{fixture.home.name}</span>
                <TeamCrest team={fixture.home} size={22} />
            </div>

            <div className="text-center font-mono font-bold tabular-nums text-[15px] md:text-base">
                {hasScore ? `${fixture.homeScore} – ${fixture.awayScore}` : <span className="text-muted-foreground text-sm">vs</span>}
            </div>

            <div className="flex items-center gap-2 min-w-0">
                <TeamCrest team={fixture.away} size={22} />
                <span className={teamClass(fixture.away.id)}>{fixture.away.name}</span>
            </div>
        </Link>
    );
}
