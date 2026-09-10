'use client';

import {X} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/football/team-crest";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {Tier} from "@/lib/fantasy/tiers";
import {RoleBadge} from "./role-badge";
import {TierBadge} from "./tier-list";

const SCORE_KEYS = ['starter', 'bonus', 'rating', 'discipline', 'fitness', 'team', 'form'] as const;

export interface CompareSide {
    player: AuctionPlayer;
    list: number;
    live: number;
    maxBid: number | null;
    tier: Tier;
    bought: {manager: string; price: number} | null;
}

function Mark({value, best}: {value: number; best: boolean}) {
    return (
        <span className={cn("relative inline-flex items-center justify-center w-11 h-7 rounded overflow-hidden border font-mono text-[13px] font-extrabold tabular-nums", best ? "border-foreground" : "border-foreground/30")}>
            <span className={cn("absolute inset-y-0 left-0", value >= 70 ? "bg-accent" : value >= 45 ? "bg-accent/45" : "bg-foreground/10")} style={{width: `${value}%`}} aria-hidden="true" />
            <span className="relative">{value}</span>
        </span>
    );
}

/** The most recent league season with a match in it (a cup only when there is nothing else). */
function lastSeason(p: AuctionPlayer) {
    return p.seasons.filter((s) => !s.cup && s.apps > 0).sort((a, b) => b.year - a.year)[0] ?? p.seasons.filter((s) => s.apps > 0).sort((a, b) => b.year - a.year)[0] ?? null;
}

/**
 * Two players side by side: the marks, the fantasy average, the prices,
 * the notes that matter at the auction and the last season's numbers.
 * The better value of each row is marked.
 */
export function CompareDialog({a, b, onClose, onBuy}: {a: CompareSide; b: CompareSide; onClose: () => void; onBuy: (player: AuctionPlayer) => void}) {
    const t = useTranslations('Fantasy.board');
    const tc = useTranslations('Fantasy.compare');
    const sides = [a, b];
    const better = (values: Array<number | null>, higher = true): boolean[] => {
        const nums = values.map((v) => (v === null ? null : v));
        if (nums.some((v) => v === null) || nums[0] === nums[1]) return [false, false];
        const top = higher ? Math.max(...(nums as number[])) : Math.min(...(nums as number[]));
        return nums.map((v) => v === top);
    };
    const cell = "px-3 py-1.5 text-center align-middle";
    const label = "px-3 py-1.5 text-left text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
    const numRow = (key: string, name: string, values: Array<number | null>, render: (v: number | null, best: boolean) => React.ReactNode, higher = true) => {
        const best = better(values, higher);
        return (
            <tr key={key} className="border-t border-muted">
                <th scope="row" className={label}>{name}</th>
                {values.map((v, i) => <td key={i} className={cn(cell, best[i] && "bg-accent/15")}>{render(v, best[i])}</td>)}
            </tr>
        );
    };
    const status = (p: AuctionPlayer) => {
        const out: string[] = [];
        if (p.injury) out.push(p.injury.category === 'suspension' ? t('suspended') : p.injury.category === 'doubtful' ? t('doubtful') : p.injury.category === 'injury' ? t('injured') : t('unavailable'));
        if (p.injury?.longTerm) out.push(t('longTerm'));
        if (p.contested) out.push(t('info.rivalsBadge'));
        if (p.newSigning) out.push(t('info.newSigningBadge'));
        if (p.penaltyTaker) out.push(t('info.penaltyBadge'));
        if (p.europe) out.push(t('info.europeBadge'));
        return out;
    };

    return (
        <div role="dialog" aria-modal="true" aria-label={tc('title')} className="fixed inset-0 z-[60] flex items-start justify-center bg-foreground/40 p-3 overflow-y-auto" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="bb-surface w-full max-w-2xl my-4 bg-background flex flex-col">
                <div className="flex items-center gap-2 px-3 h-11 border-b-2 border-foreground bg-card rounded-t-[calc(var(--radius-lg)-2px)]">
                    <h2 className="text-[14px] font-extrabold uppercase tracking-wide">{tc('title')}</h2>
                    <span className="text-[11px] font-semibold text-muted-foreground truncate">{tc('hint')}</span>
                    <button type="button" onClick={onClose} aria-label={t('close')} className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-md border-2 border-foreground bg-background hover:bg-muted"><X className="w-4 h-4" /></button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px] font-semibold">
                        <thead>
                            <tr>
                                <th className={label} />
                                {sides.map(({player: p}) => (
                                    <th key={p.id} className="px-3 py-2 text-center">
                                        <span className="flex flex-col items-center gap-1">
                                            <TeamCrest team={p.team} size={28} />
                                            <Link href={`/players/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-[15px] font-extrabold hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.name}</Link>
                                            <span className="text-[11px] font-semibold text-muted-foreground">{p.team.name}{p.age !== null ? ` · ${p.age}` : ''} · {p.scores.sample} PG</span>
                                            <span className="inline-flex items-center gap-1"><RoleBadge role={p.role} /><TierBadge tier={sides.find((s) => s.player.id === p.id)!.tier} /></span>
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {numRow('overall', t('columns.overall'), sides.map((s) => s.player.scores.overall), (v, best) => <span className={cn("inline-flex items-center justify-center w-11 h-7 rounded bg-foreground text-background font-mono text-[13px] font-extrabold tabular-nums", best && "ring-2 ring-accent")}>{v}</span>)}
                            {numRow('fantaAvg', t('columns.fantaAvg'), sides.map((s) => s.player.scores.fantaAvg), (v, best) => <span className={cn("font-mono text-[14px] font-extrabold tabular-nums", best && "underline decoration-accent decoration-[3px] underline-offset-4")}>{v?.toFixed(2) ?? '–'}</span>)}
                            {SCORE_KEYS.map((k) => numRow(k, t(`columns.${k === 'team' ? 'team_' : k}`), sides.map((s) => s.player.scores[k]), (v, best) => <Mark value={v ?? 0} best={best} />))}
                            {numRow('live', t('columns.price'), sides.map((s) => s.live), (v, best) => <span className={cn("font-mono text-[14px] font-extrabold tabular-nums", best && "underline decoration-accent decoration-[3px] underline-offset-4")}>{v}</span>, false)}
                            {numRow('list', tc('list'), sides.map((s) => s.list), (v) => <span className="font-mono text-[12px] font-semibold tabular-nums text-muted-foreground">{v}</span>, false)}
                            {sides.some((s) => s.maxBid !== null) && numRow('max', t('columns.maxBid'), sides.map((s) => s.maxBid), (v) => <span className="font-mono text-[12px] font-bold tabular-nums text-accent-text">{v ?? '–'}</span>)}
                            <tr className="border-t border-muted">
                                <th scope="row" className={label}>{t('columns.status')}</th>
                                {sides.map((s) => {
                                    const flags = status(s.player);
                                    return (
                                        <td key={s.player.id} className={cn(cell, "text-[11px]")}>
                                            {s.bought ? <span className="font-extrabold">{t('boughtBy', {manager: s.bought.manager, price: s.bought.price})}</span> : flags.length > 0 ? flags.join(' · ') : <span className="text-muted-foreground">–</span>}
                                        </td>
                                    );
                                })}
                            </tr>
                            <tr className="border-t border-muted">
                                <th scope="row" className={label}>{tc('lastSeason')}</th>
                                {sides.map((s) => {
                                    const l = lastSeason(s.player);
                                    return (
                                        <td key={s.player.id} className={cn(cell, "text-[11px]")}>
                                            {l ? tc('seasonLine', {year: `${l.year}/${String(l.year + 1).slice(2)}`, team: l.team, apps: l.apps, goals: l.goals, assists: l.assists, rating: l.rating?.toFixed(2) ?? '–'}) : <span className="text-muted-foreground">–</span>}
                                        </td>
                                    );
                                })}
                            </tr>
                            <tr className="border-t-2 border-foreground">
                                <td />
                                {sides.map((s) => (
                                    <td key={s.player.id} className={cn(cell, "py-2")}>
                                        {!s.bought && <button type="button" onClick={() => onBuy(s.player)} className="bb-btn bg-accent h-8 px-3 text-[12px] font-extrabold">{t('buy')}</button>}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
