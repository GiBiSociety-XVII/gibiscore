import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/home/team-crest";
import type {StandingGroup} from "@/lib/football/types";

function FormDots({form}: {form: string | null | undefined}) {
    if (!form) return null;
    const last = form.slice(-5).split('');
    return (
        <span className="inline-flex gap-1">
            {last.map((r, i) => (
                <span
                    key={i}
                    className={cn(
                        "inline-flex w-5 h-5 items-center justify-center rounded-md border-2 border-foreground text-[10px] font-extrabold",
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

/** Full table with optional groups, highlighted team and form column. */
export function StandingsTable({groups, highlightTeamId, title}: {groups: StandingGroup[]; highlightTeamId?: number; title?: string}) {
    const t = useTranslations('Football.table');
    const tEmpty = useTranslations('Football.empty');

    if (groups.length === 0 || groups.every((g) => g.rows.length === 0)) {
        return (
            <Card className="p-6">
                {title && <h2 className="text-[22px] font-extrabold tracking-tight mb-2">{title}</h2>}
                <p className="text-sm font-semibold text-muted-foreground">{tEmpty('noStandings')}</p>
            </Card>
        );
    }

    return (
        <Card className="p-4 md:p-6 flex flex-col gap-6 min-w-0">
            {title && <h2 className="text-[22px] font-extrabold tracking-tight">{title}</h2>}
            {groups.map((group) => (
                <div key={group.name} className="flex flex-col gap-2 min-w-0">
                    {group.name && <h3 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">{group.name}</h3>}
                    <div className="overflow-x-auto">
                        <table className="w-full text-[15px]">
                            <thead>
                                <tr className="text-muted-foreground text-xs font-extrabold tracking-wider">
                                    <th className="px-2 py-1.5 w-8 text-left">{t('position')}</th>
                                    <th className="px-2 py-1.5 text-left uppercase">{t('team')}</th>
                                    {(['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'goalDiff', 'points'] as const).map((col) => (
                                        <th key={col} className={cn("px-2 py-1.5 text-right font-mono", (col === 'goalsFor' || col === 'goalsAgainst') && "hidden md:table-cell")}>{t(col)}</th>
                                    ))}
                                    <th className="px-2 py-1.5 text-right hidden lg:table-cell">{t('form')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.rows.map((row, index) => (
                                    <tr
                                        key={row.team.id}
                                        className={cn("font-bold border-t-2", index === 0 ? "border-foreground" : "border-muted", highlightTeamId === row.team.id && "bg-accent/20")}
                                    >
                                        <td className="px-2 py-2.5">
                                            <span className={cn("inline-flex items-center justify-center w-[22px] h-[22px] rounded-md border-2 border-foreground text-xs font-mono", row.position <= 4 ? "bg-accent" : "bg-card")}>
                                                {row.position}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2.5">
                                            <Link href={`/teams/${row.team.slug ?? row.team.id}`} className="inline-flex items-center gap-2 hover:underline decoration-accent decoration-[3px] underline-offset-4">
                                                <TeamCrest team={row.team} size={24} />
                                                <span className="truncate">{row.team.name}</span>
                                            </Link>
                                        </td>
                                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">{row.played}</td>
                                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">{row.won}</td>
                                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">{row.drawn}</td>
                                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">{row.lost}</td>
                                        <td className="px-2 py-2.5 text-right font-mono tabular-nums hidden md:table-cell">{row.goalsFor ?? '–'}</td>
                                        <td className="px-2 py-2.5 text-right font-mono tabular-nums hidden md:table-cell">{row.goalsAgainst ?? '–'}</td>
                                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                                        <td className="px-2 py-2.5 text-right font-mono tabular-nums font-extrabold">{row.points}</td>
                                        <td className="px-2 py-2.5 text-right hidden lg:table-cell"><FormDots form={row.form} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </Card>
    );
}
