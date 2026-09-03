import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {cn} from "@/components/shared/ui/cn";
import type {StandingRow} from "@/lib/football/types";

const NUMERIC_COLS = ['played', 'won', 'drawn', 'lost', 'goalDiff', 'points'] as const;

export function StandingsTable({leagueName, rows, fullHref}: {leagueName: string; rows: StandingRow[]; fullHref: string}) {
    const t = useTranslations('HomePage.standings');

    return (
        <Card className="p-4 flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold tracking-tight">{t('title', {league: leagueName})}</h2>
                <Link href={fullHref} className="text-sm font-extrabold underline decoration-accent decoration-[2px] underline-offset-4">
                    {t('full')}
                </Link>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="text-muted-foreground text-xs font-extrabold tracking-wider">
                            <th className="px-1.5 py-1 w-8 text-left">#</th>
                            <th className="px-1.5 py-1 text-left uppercase">{t('team')}</th>
                            {NUMERIC_COLS.map((col) => (
                                <th key={col} className="px-1.5 py-1 text-right font-mono">{t(col)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={row.team.id} className={cn("font-bold border-t-2", index === 0 ? "border-foreground" : "border-muted")}>
                                <td className="px-1.5 py-1.5">
                                    <span className={cn(
                                        "inline-flex items-center justify-center w-5 h-5 rounded-md border-2 border-foreground text-[11px] font-mono",
                                        row.position <= 4 ? "bg-accent" : "bg-card",
                                    )}>
                                        {row.position}
                                    </span>
                                </td>
                                <td className="px-1.5 py-1.5">{row.team.name}</td>
                                <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{row.played}</td>
                                <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{row.won}</td>
                                <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{row.drawn}</td>
                                <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{row.lost}</td>
                                <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                                <td className="px-1.5 py-1.5 text-right font-mono tabular-nums font-extrabold">{row.points}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
