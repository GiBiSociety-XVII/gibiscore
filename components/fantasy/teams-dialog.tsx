'use client';

import {X} from "lucide-react";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/football/team-crest";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {TeamReport} from "@/lib/fantasy/report";
import type {FantaRole} from "@/lib/fantasy/scores";
import type {Tier} from "@/lib/fantasy/tiers";
import {RoleBadge} from "./role-badge";
import {Meter, TeamReportCard} from "./team-report";
import {TierBadge} from "./tier-list";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

export interface DialogTeam {
    manager: number;
    name: string;
    report: TeamReport;
    players: Array<{player: AuctionPlayer; price: number}>;
    spent: number;
    left: number;
}

export type TeamsTab = 'compare' | number;

function Mark({value}: {value: number}) {
    return (
        <span className="relative inline-flex items-center justify-center w-9 h-6 rounded overflow-hidden border border-foreground/30 bg-muted/40 font-mono text-[12px] font-extrabold tabular-nums">
            <span className={cn("absolute inset-y-0 left-0", value >= 70 ? "bg-accent" : value >= 45 ? "bg-accent/45" : "bg-foreground/10")} style={{width: `${value}%`}} aria-hidden="true" />
            <span className="relative">{value}</span>
        </span>
    );
}

/**
 * Every roster of the auction in one window: a comparison of the teams,
 * then one tab per manager with the report card and the players, role
 * by role, with their marks and what they cost.
 */
export function TeamsDialog({teams, credits, tiers, initial, onClose, onRelease, me = 0}: {teams: DialogTeam[]; credits: number; tiers: Map<number, Tier>; initial: TeamsTab; onClose: () => void; onRelease: (playerId: number) => void; me?: number}) {
    const t = useTranslations('Fantasy.roster.report');
    const tb = useTranslations('Fantasy.board');
    const [tab, setTab] = useState<TeamsTab>(initial);
    const ranked = teams.slice().sort((a, b) => b.report.overall - a.report.overall || b.report.filled - a.report.filled);
    const current = tab === 'compare' ? null : (teams.find((x) => x.manager === tab) ?? null);
    const chip = (active: boolean) => cn("inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border-2 text-[12px] font-extrabold whitespace-nowrap transition-colors", active ? "border-foreground bg-accent" : "border-foreground/30 bg-card hover:bg-muted");

    return (
        <div role="dialog" aria-modal="true" aria-label={t('dialogTitle')} className="fixed inset-0 z-[60] flex items-start justify-center bg-foreground/40 p-3 overflow-y-auto" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="bb-surface w-full max-w-3xl my-4 bg-background flex flex-col">
                <div className="flex items-center gap-2 px-3 h-11 border-b-2 border-foreground bg-card rounded-t-[calc(var(--radius-lg)-2px)]">
                    <h2 className="text-[14px] font-extrabold uppercase tracking-wide">{t('dialogTitle')}</h2>
                    <span className="text-[11px] font-semibold text-muted-foreground truncate">{t('dialogHint')}</span>
                    <button type="button" onClick={onClose} aria-label={tb('close')} className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-md border-2 border-foreground bg-background hover:bg-muted"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex gap-1.5 px-3 py-2 overflow-x-auto [scrollbar-width:thin] border-b border-muted">
                    <button type="button" onClick={() => setTab('compare')} className={chip(tab === 'compare')}>{t('compare')}</button>
                    {teams.map((team) => (
                        <button key={team.manager} type="button" onClick={() => setTab(team.manager)} className={chip(tab === team.manager)}>
                            <span className="truncate max-w-[9rem]">{team.name}</span>
                            <span className={cn("inline-flex items-center justify-center min-w-6 h-5 px-1 rounded border font-mono text-[11px] tabular-nums", team.report.filled === 0 ? "border-foreground/30 text-muted-foreground" : "border-foreground bg-background")}>{team.report.filled === 0 ? '–' : team.report.overall}</span>
                        </button>
                    ))}
                </div>

                {tab === 'compare' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px] font-semibold">
                            <thead className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                                <tr className="border-b border-muted">
                                    <th className="px-3 py-1.5 text-left">{t('colTeam')}</th>
                                    <th className="px-2 py-1.5 text-center">{t('overall')}</th>
                                    <th className="px-2 py-1.5 text-center">{t('colStarterShort')}</th>
                                    <th className="px-2 py-1.5 text-center">{t('fantaAvg')}</th>
                                    <th className="px-2 py-1.5 text-left">{t('colLineup')}</th>
                                    <th className="px-2 py-1.5 text-center">{t('colRoster')}</th>
                                    <th className="px-2 py-1.5 text-center">{t('colStarters')}</th>
                                    <th className="px-2 py-1.5 text-right">{t('colSpentLeft')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ranked.map((team, i) => (
                                    <tr key={team.manager} className="border-b border-muted last:border-b-0 hover:bg-muted/40 cursor-pointer" onClick={() => setTab(team.manager)}>
                                        <td className="px-3 py-1.5">
                                            <span className="inline-flex items-center gap-2">
                                                <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-4">{i + 1}</span>
                                                <span className="font-extrabold truncate max-w-[12rem]">{team.name}</span>
                                                {team.manager === me && <span className="text-[10px] uppercase text-muted-foreground">{tb('mine')}</span>}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-center">{team.report.filled === 0 ? '–' : <Mark value={team.report.overall} />}</td>
                                        <td className="px-2 py-1.5 text-center">{team.report.filled === 0 ? '–' : <Mark value={team.report.starter} />}</td>
                                        <td className="px-2 py-1.5 text-center font-mono font-extrabold tabular-nums">{team.report.fantaAvg === null ? '–' : team.report.fantaAvg.toFixed(1)}</td>
                                        <td className="px-2 py-1.5 whitespace-nowrap">{team.report.lineup ? <>{team.report.lineup.formation} <span className="font-mono tabular-nums text-muted-foreground">{team.report.lineup.value.toFixed(1)}</span></> : <span className="text-muted-foreground">{t('short', {missing: Math.max(0, 11 - team.report.filled)})}</span>}</td>
                                        <td className="px-2 py-1.5 text-center font-mono tabular-nums">{team.report.filled}/{team.report.total}</td>
                                        <td className="px-2 py-1.5 text-center font-mono tabular-nums">
                                            {team.report.starters}
                                            {team.report.injured > 0 && <span className="ml-1 text-red-700">{t('injuredShort', {count: team.report.injured})}</span>}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{team.spent} <span className="text-muted-foreground">/ {team.left}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('compareHint', {credits})}</p>
                    </div>
                )}

                {current && (
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-muted text-[12px] font-semibold text-muted-foreground">
                            <span className="text-[14px] font-extrabold text-foreground truncate">{current.name}</span>
                            <span className="ml-auto font-mono tabular-nums whitespace-nowrap">{t('spentLeft', {spent: current.spent, left: current.left, credits})}</span>
                        </div>
                        <TeamReportCard report={current.report} />
                        <div className="border-t-2 border-foreground">
                            {current.players.length === 0 ? (
                                <p className="px-3 py-3 text-[12px] font-semibold text-muted-foreground">{t('noPlayers')}</p>
                            ) : (
                                <table className="w-full text-[12px]">
                                    <thead className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                                        <tr className="border-b border-muted">
                                            <th className="px-3 py-1.5 text-left" colSpan={2}>{t('colPlayer')}</th>
                                            <th className="px-2 py-1.5 text-left">{t('colClub')}</th>
                                            <th className="px-2 py-1.5 text-center">{t('colTier')}</th>
                                            <th className="px-2 py-1.5 text-center">{t('colStarterShort')}</th>
                                            <th className="px-2 py-1.5 text-center">{t('overall')}</th>
                                            <th className="px-2 py-1.5 text-center">{t('colFm')}</th>
                                            <th className="px-2 py-1.5 text-right">{t('colPrice')}</th>
                                            <th className="px-2 py-1.5" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ROLES.flatMap((role) => {
                                            const own = current.players.filter((x) => x.player.role === role).sort((a, b) => b.player.scores.overall - a.player.scores.overall);
                                            const line = current.report.roles.find((r) => r.role === role)!;
                                            return [
                                                <tr key={`h-${role}`} className="bg-muted/40 border-b border-muted">
                                                    <td colSpan={9} className="px-3 py-1">
                                                        <span className="inline-flex items-center gap-2 text-[11px] font-extrabold">
                                                            <RoleBadge role={role} />
                                                            <span className="font-mono tabular-nums">{line.count}/{line.slots}</span>
                                                            <Meter value={line.count === 0 ? 0 : line.starter} className="w-20" />
                                                            <span className="text-muted-foreground font-semibold">{line.count === 0 ? t('none') : t('roleHint', {starters: line.starters, count: line.count, spent: line.spent})}</span>
                                                        </span>
                                                    </td>
                                                </tr>,
                                                ...own.map(({player: p, price}) => (
                                                    <tr key={p.id} className="border-b border-muted last:border-b-0">
                                                        <td className="pl-3 pr-1 py-1 w-7"><RoleBadge role={p.role} /></td>
                                                        <td className="px-1 py-1 min-w-0">
                                                            <span className="flex flex-col">
                                                                <Link href={`/players/${p.slug}`} target="_blank" rel="noopener noreferrer" title={p.fullName ?? undefined} className="font-extrabold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.name}</Link>
                                                                {(p.injury?.longTerm || p.contested) && (
                                                                    <span className={cn("text-[10px] font-bold", p.injury?.longTerm ? "text-red-700" : "text-amber-700")}>{p.injury?.longTerm ? t('playerInjured') : t('playerContested')}</span>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-1"><span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground whitespace-nowrap"><TeamCrest team={p.team} size={14} />{p.team.name}</span></td>
                                                        <td className="px-2 py-1 text-center"><TierBadge tier={tiers.get(p.id) ?? 'filler'} /></td>
                                                        <td className="px-2 py-1 text-center"><Mark value={p.scores.starter} /></td>
                                                        <td className="px-2 py-1 text-center"><Mark value={p.scores.overall} /></td>
                                                        <td className="px-2 py-1 text-center font-mono font-extrabold tabular-nums">{p.scores.fantaAvg === null ? '–' : p.scores.fantaAvg.toFixed(1)}</td>
                                                        <td className="px-2 py-1 text-right font-mono font-extrabold tabular-nums">{price}</td>
                                                        <td className="px-2 py-1 text-right"><button type="button" onClick={() => onRelease(p.id)} aria-label={tb('release')} title={tb('release')} className="inline-flex w-5 h-5 items-center justify-center rounded border border-foreground/50 bg-card hover:bg-accent"><X className="w-3 h-3" /></button></td>
                                                    </tr>
                                                )),
                                            ];
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
