import Image from "next/image";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import type {RankedPlayer} from "@/lib/football/types";
import {TeamCrest} from "./team-crest";

export type RankingKind = 'scorers' | 'assists' | 'ratings';

/** Top players of a season: scorers, assist makers or best ratings. */
export function Rankings({kind, players, limit}: {kind: RankingKind; players: RankedPlayer[]; limit?: number}) {
    const t = useTranslations('Football.rankings');
    const rows = limit ? players.slice(0, limit) : players;
    if (rows.length === 0) return <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('empty')}</p>;
    const value = (p: RankedPlayer) => (kind === 'scorers' ? p.goals : kind === 'assists' ? p.assists : (p.rating?.toFixed(2) ?? '–'));
    const secondary = (p: RankedPlayer) => (kind === 'scorers' ? (p.penaltiesScored > 0 ? `${p.assists} · ${p.penaltiesScored} rig.` : String(p.assists)) : kind === 'assists' ? String(p.goals) : String(p.appearances));
    return (
        <table className="w-full text-[13px]">
            <thead>
                <tr className="text-muted-foreground text-[10px] font-extrabold tracking-wider uppercase">
                    <th className="px-1 py-1 w-7 text-left">#</th>
                    <th className="px-1 py-1 text-left">{t('player')}</th>
                    <th className="px-1 py-1 text-right font-mono">{t('apps')}</th>
                    <th className="px-1 py-1 text-right font-mono">{kind === 'scorers' ? t('assists') : kind === 'assists' ? t('goals') : t('apps')}</th>
                    <th className="px-1 py-1 text-right font-mono">{kind === 'scorers' ? t('goals') : kind === 'assists' ? t('assists') : t('rating')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((p, i) => (
                    <tr key={`${p.player.id}-${p.team.id}`} className="border-t border-muted">
                        <td className="px-1 py-1 font-mono text-[11px] font-bold text-muted-foreground">{i + 1}</td>
                        <td className="px-1 py-1">
                            <Link href={`/players/${p.player.slug}`} className="flex items-center gap-2 min-w-0 hover:underline decoration-accent decoration-[3px] underline-offset-2">
                                <span className="inline-flex w-6 h-6 rounded-full bg-muted overflow-hidden shrink-0">
                                    {p.player.imageUrl && <Image src={p.player.imageUrl} alt="" width={24} height={24} unoptimized className="object-cover" />}
                                </span>
                                <span className="flex flex-col min-w-0 leading-tight">
                                    <span className="font-bold truncate">{p.player.name}</span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground truncate">
                                        <TeamCrest team={p.team} size={12} />
                                        {p.team.name}
                                    </span>
                                </span>
                            </Link>
                        </td>
                        <td className="px-1 py-1 text-right font-mono tabular-nums">{p.appearances}</td>
                        <td className="px-1 py-1 text-right font-mono tabular-nums text-muted-foreground">{secondary(p)}</td>
                        <td className={cn("px-1 py-1 text-right font-mono tabular-nums font-extrabold", i === 0 && "text-accent-foreground")}>
                            <span className={cn("inline-block px-1 rounded", i === 0 && "bg-accent")}>{value(p)}</span>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
