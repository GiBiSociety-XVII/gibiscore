import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import type {StandingGroup, StandingZone} from "@/lib/football/types";

const ZONE_CLASS: Record<StandingZone, string> = {
    champions: "bg-accent",
    europa: "bg-[#2f6bff]",
    conference: "bg-[#22b8a8]",
    promotion: "bg-accent",
    playoff: "bg-[#f2b600]",
    relegation: "bg-[#e5323e]",
    relegation_playoff: "bg-[#f08a4b]",
};

/** Legend of the zones that actually appear in the table, in table order. */
function ZoneLegend({rows, labels}: {rows: StandingGroup['rows']; labels: (zone: StandingZone) => string}) {
    const seen: StandingZone[] = [];
    for (const r of rows) if (r.zone && !seen.includes(r.zone)) seen.push(r.zone);
    if (seen.length === 0) return null;
    return (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 px-2 py-1.5 text-[10px] font-bold text-muted-foreground border-t border-muted">
            {seen.map((zone) => (
                <li key={zone} className="inline-flex items-center gap-1">
                    <span className={cn("inline-block w-2 h-2 rounded-sm", ZONE_CLASS[zone])} />
                    {labels(zone)}
                </li>
            ))}
        </ul>
    );
}
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
    const tZone = useTranslations('Football.zones');

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
                                            <td className={cn("px-1 relative", compact ? "py-1" : "py-1.5")}>
                                                {row.zone && <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", ZONE_CLASS[row.zone])} aria-hidden="true" />}
                                                <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-mono font-bold", row.zone === 'champions' || row.zone === 'promotion' ? "bg-accent" : "bg-muted")}>{row.position}</span>
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
                    {!compact && <ZoneLegend rows={group.rows} labels={(zone) => tZone(zone)} />}
                </div>
            ))}
        </div>
    );
}
