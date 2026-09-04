import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import type {StandingGroup} from "@/lib/football/types";
import {TeamCrest} from "./team-crest";

function FormDots({form}: {form: string | null | undefined}) {
    if (!form) return null;
    const last = form.slice(-5).split('');
    return (
        <span className="inline-flex gap-0.5">
            {last.map((r, i) => (
                <span
                    key={i}
                    className={cn(
                        "inline-flex w-4 h-4 items-center justify-center rounded text-[9px] font-extrabold",
                        r === 'W' && "bg-accent",
                        r === 'D' && "bg-muted",
                        r === 'L' && "bg-foreground text-background",
                    )}
                >
                    {r === 'W' ? 'V' : r === 'D' ? 'N' : r === 'L' ? 'P' : r}
                </span>
            ))}
        </span>
    );
}

/**
 * League table. `compact` shows position, team, played, goal difference and
 * points only (side rail); the full variant adds every column and the form.
 */
export function StandingsTable({groups, highlightTeamIds = [], compact = false, limit}: {groups: StandingGroup[]; highlightTeamIds?: number[]; compact?: boolean; limit?: number}) {
    const t = useTranslations('Football.table');
    const tEmpty = useTranslations('Football.empty');

    if (groups.length === 0 || groups.every((g) => g.rows.length === 0)) {
        return <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{tEmpty('noStandings')}</p>;
    }
    const cell = cn("px-1 text-right font-mono tabular-nums", compact ? "py-1" : "py-1.5");

    return (
        <div className="flex flex-col gap-3 min-w-0">
            {groups.map((group) => (
                <div key={group.name} className="flex flex-col min-w-0">
                    {group.name && <h3 className="px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground bg-muted/60">{group.name}</h3>}
                    <div className="overflow-x-auto">
                        <table className={cn("w-full", compact ? "text-[12px]" : "text-[13px]")}>
                            <thead>
                                <tr className="text-muted-foreground text-[10px] font-extrabold tracking-wider uppercase">
                                    <th className="px-1 py-1 w-7 text-left">{t('position')}</th>
                                    <th className="px-1 py-1 text-left">{t('team')}</th>
                                    <th className="px-1 py-1 text-right font-mono">{t('played')}</th>
                                    {!compact && (['won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst'] as const).map((col) => (
                                        <th key={col} className={cn("px-1 py-1 text-right font-mono", (col === 'goalsFor' || col === 'goalsAgainst') && "hidden md:table-cell")}>{t(col)}</th>
                                    ))}
                                    <th className="px-1 py-1 text-right font-mono">{t('goalDiff')}</th>
                                    <th className="px-1 py-1 text-right font-mono">{t('points')}</th>
                                    {!compact && <th className="px-1 py-1 text-right hidden lg:table-cell">{t('form')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {(limit ? group.rows.slice(0, limit) : group.rows).map((row) => {
                                    const highlighted = highlightTeamIds.includes(row.team.id);
                                    return (
                                        <tr key={row.team.id} className={cn("border-t border-muted", highlighted && "bg-accent/25")}>
                                            <td className={cn("px-1", compact ? "py-1" : "py-1.5")}>
                                                <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-mono font-bold", row.position <= 4 ? "bg-accent" : "bg-muted")}>{row.position}</span>
                                            </td>
                                            <td className={cn("px-1 font-bold", compact ? "py-1" : "py-1.5")}>
                                                <Link href={`/teams/${row.team.slug ?? row.team.id}`} className="inline-flex items-center gap-1.5 hover:underline decoration-accent decoration-[3px] underline-offset-2 max-w-full">
                                                    <TeamCrest team={row.team} size={16} />
                                                    <span className="truncate">{row.team.name}</span>
                                                </Link>
                                            </td>
                                            <td className={cell}>{row.played}</td>
                                            {!compact && (
                                                <>
                                                    <td className={cell}>{row.won}</td>
                                                    <td className={cell}>{row.drawn}</td>
                                                    <td className={cell}>{row.lost}</td>
                                                    <td className={cn(cell, "hidden md:table-cell")}>{row.goalsFor ?? '–'}</td>
                                                    <td className={cn(cell, "hidden md:table-cell")}>{row.goalsAgainst ?? '–'}</td>
                                                </>
                                            )}
                                            <td className={cell}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                                            <td className={cn(cell, "font-extrabold")}>{row.points}</td>
                                            {!compact && <td className={cn("px-1 text-right hidden lg:table-cell", compact ? "py-1" : "py-1.5")}><FormDots form={row.form} /></td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}
