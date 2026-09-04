import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/football/team-crest";
import type {PlayerMatchLine, TeamSummary} from "@/lib/football/types";

function Rating({value, accent = 7}: {value: number | null; accent?: number}) {
    if (value === null) return <span className="text-muted-foreground">–</span>;
    return (
        <span className={cn("inline-block font-mono text-[11px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md border-2 border-foreground", value >= accent ? "bg-accent" : "bg-card")}>
            {value.toFixed(1)}
        </span>
    );
}

function TeamTable({team, lines}: {team: TeamSummary; lines: PlayerMatchLine[]}) {
    const t = useTranslations('Football.playerTable');
    const tPos = useTranslations('Football.positionsShort');
    return (
        <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2">
                <TeamCrest team={team} size={20} />
                <span className="font-extrabold">{team.name}</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="text-muted-foreground text-[11px] font-extrabold tracking-wider">
                            <th className="px-1.5 py-1 text-left uppercase">{t('player')}</th>
                            <th className="px-1.5 py-1 text-right font-mono">{t('minutes')}</th>
                            <th className="px-1.5 py-1 text-right font-mono">{t('rating')}</th>
                            <th className="px-1.5 py-1 text-right font-mono" title={t('fantasyHint')}>{t('fantasy')}</th>
                            <th className="px-1.5 py-1 text-right font-mono">{t('goals')}</th>
                            <th className="px-1.5 py-1 text-right font-mono">{t('assists')}</th>
                            <th className="px-1.5 py-1 text-right font-mono hidden md:table-cell">{t('shots')}</th>
                            <th className="px-1.5 py-1 text-right font-mono hidden md:table-cell">{t('keyPasses')}</th>
                            <th className="px-1.5 py-1 text-right font-mono">{t('cards')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l) => {
                            const pos = l.position && ['goalkeeper', 'defender', 'midfielder', 'attacker'].includes(l.position) ? l.position : 'unknown';
                            return (
                                <tr key={l.player.id} className={cn("border-t-2 border-muted font-semibold", (l.minutes ?? 0) === 0 && "text-muted-foreground")}>
                                    <td className="px-1.5 py-1">
                                        <span className="inline-flex items-center gap-2 min-w-0">
                                            <span className="inline-flex w-5 h-5 items-center justify-center rounded-md border-2 border-foreground bg-card text-[10px] font-extrabold shrink-0">{tPos(pos as 'goalkeeper')}</span>
                                            <Link href={`/players/${l.player.slug}`} className="truncate hover:underline decoration-accent decoration-[3px] underline-offset-4">{l.player.name}</Link>
                                        </span>
                                    </td>
                                    <td className="px-1.5 py-1 text-right font-mono tabular-nums">{l.minutes ?? '–'}</td>
                                    <td className="px-1.5 py-1 text-right"><Rating value={l.rating} /></td>
                                    <td className="px-1.5 py-1 text-right"><Rating value={l.fantasy} accent={7.5} /></td>
                                    <td className="px-1.5 py-1 text-right font-mono tabular-nums">{l.goals || ''}</td>
                                    <td className="px-1.5 py-1 text-right font-mono tabular-nums">{l.assists || ''}</td>
                                    <td className="px-1.5 py-1 text-right font-mono tabular-nums hidden md:table-cell">{l.shots ?? ''}{l.shotsOnTarget !== null && l.shots ? ` (${l.shotsOnTarget})` : ''}</td>
                                    <td className="px-1.5 py-1 text-right font-mono tabular-nums hidden md:table-cell">{l.keyPasses ?? ''}</td>
                                    <td className="px-1.5 py-1 text-right">
                                        {l.yellowCards > 0 && <span className="inline-block w-2.5 h-3.5 bg-yellow-300 border border-foreground rounded-[2px] mr-0.5" />}
                                        {l.redCards > 0 && <span className="inline-block w-2.5 h-3.5 bg-red-500 border border-foreground rounded-[2px]" />}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function PlayerMatchTable({home, away, homeTeam, awayTeam, title}: {home: PlayerMatchLine[]; away: PlayerMatchLine[]; homeTeam: TeamSummary; awayTeam: TeamSummary; title: string}) {
    const t = useTranslations('Football');
    return (
        <Card className="p-3 md:p-4 flex flex-col gap-3 min-w-0">
            <div className="flex flex-col gap-1">
                <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
                <p className="text-xs font-semibold text-muted-foreground">{t('playerTable.fantasyHint')}</p>
            </div>
            {home.length === 0 && away.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{t('empty.noPlayers')}</p>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {home.length > 0 && <TeamTable team={homeTeam} lines={home} />}
                    {away.length > 0 && <TeamTable team={awayTeam} lines={away} />}
                </div>
            )}
        </Card>
    );
}
