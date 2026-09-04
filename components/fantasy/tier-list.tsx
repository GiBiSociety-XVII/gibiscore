'use client';

import {HelpCircle, X} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {FantaRole} from "@/lib/fantasy/scores";
import {TIERS, groupByTier, type Tier, type TierInfo, type TierWhy as Why} from "@/lib/fantasy/tiers";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

export const TIER_CLASS: Record<Tier, string> = {
    top: 'bg-foreground text-background border-foreground',
    semiTop: 'bg-accent border-foreground',
    first: 'bg-accent/45 border-foreground/70',
    second: 'bg-muted border-foreground/50',
    third: 'bg-card border-foreground/40',
    fourth: 'bg-card border-foreground/30 text-foreground/80',
    fifth: 'bg-card border-foreground/25 text-muted-foreground',
    jolly: 'bg-amber-200 border-foreground',
    filler: 'bg-card border-dashed border-foreground/30 text-muted-foreground',
    avoid: 'bg-red-100 border-red-700 text-red-800',
};

/** Tiers listed in short in the tier view: the long tail is cut. */
const CUT: Partial<Record<Tier, number>> = {filler: 12, avoid: 8};

export function TierBadge({tier, short = true, className}: {tier: Tier; short?: boolean; className?: string}) {
    const t = useTranslations('Fantasy.tiers');
    return <span className={cn("inline-flex items-center justify-center h-5 px-1.5 rounded border text-[10px] font-extrabold uppercase tracking-wide whitespace-nowrap", TIER_CLASS[tier], className)} title={t(`${tier}.name`)}>{short ? t(`${tier}.short`) : t(`${tier}.name`)}</span>;
}

const SCORE_KEYS = ['starter', 'bonus', 'rating', 'discipline', 'fitness', 'team', 'form'] as const;

/** One reason of a tier, in words. */
function useWhyText(role: FantaRole) {
    const t = useTranslations('Fantasy.tiers');
    return (w: Why, info: TierInfo): string => {
        const roles = t(`roleMany.${role}`);
        switch (w.kind) {
            case 'ranked': return w.tier === 'fifth' ? t('why.lastBought', {from: w.from, to: w.to}) : t('why.ranked', {from: w.from, to: w.to, bought: info.bought, roles, tier: t(`${w.tier}.name`)});
            case 'belowBought': return t('why.belowBought', {bought: info.bought, roles});
            case 'thinDropped': return t('why.thinDropped', {sample: w.sample, from: t(`${w.from}.name`)});
            case 'longInjury': return w.daysOut === null ? t('why.longInjuryUnknown') : t('why.longInjury', {days: w.daysOut});
            case 'neverPlays': return t('why.neverPlays', {starter: w.starter});
            case 'lowFitness': return t('why.lowFitness', {fitness: w.fitness});
            case 'young': return t('why.young', {age: w.age, bonus: w.bonus});
            case 'hotStart': return t('why.hotStart', {form: w.form});
            case 'thinPromising': return t('why.thinPromising', {sample: w.sample});
            case 'filler': return t('why.filler');
        }
    };
}

/** A "?" that opens the reasons behind a player's tier: rank, the rule that put him there, strengths and weaknesses. */
export function TierWhy({player, info}: {player: AuctionPlayer; info: TierInfo}) {
    const t = useTranslations('Fantasy.tiers');
    const text = useWhyText(player.role);
    const [open, setOpen] = useState<{top: number; left: number} | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const card = useRef<HTMLDivElement>(null);
    // Rendered in a portal at a fixed position: the list scrolls sideways and would clip it.
    const toggle = () => {
        if (open || !button.current) return setOpen(null);
        const r = button.current.getBoundingClientRect();
        const width = Math.min(320, window.innerWidth - 16);
        setOpen({top: Math.min(r.bottom + 6, window.innerHeight - 260), left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8))});
    };
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (card.current && !card.current.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(null); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
        const onScroll = () => setOpen(null);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); };
    }, [open]);
    const strengths = SCORE_KEYS.filter((k) => player.scores[k] >= 70).map((k) => `${t(`why.scores.${k}`)} ${player.scores[k]}`);
    const weaknesses = SCORE_KEYS.filter((k) => player.scores[k] <= 40).map((k) => `${t(`why.scores.${k}`)} ${player.scores[k]}`);
    return (
        <>
            <button ref={button} type="button" onClick={toggle} aria-expanded={!!open} aria-label={t('why.button')} title={t('why.button')} className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-foreground/40 bg-card text-muted-foreground hover:bg-accent hover:text-foreground shrink-0">
                <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            {open && typeof document !== 'undefined' && createPortal(
                <div ref={card} role="dialog" style={{top: open.top, left: open.left, width: Math.min(320, window.innerWidth - 16)}} className="fixed z-[70] rounded-lg border-2 border-foreground bg-background shadow-[4px_4px_0_0_var(--color-foreground)] p-3 flex flex-col gap-1.5 text-left normal-case tracking-normal">
                    <div className="flex items-center gap-2">
                        <TierBadge tier={info.tier} short={false} />
                        <span className="text-[12px] font-extrabold truncate">{player.name}</span>
                        <button type="button" onClick={() => setOpen(null)} aria-label={t('why.close')} className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded border border-foreground bg-card shrink-0"><X className="w-3 h-3" /></button>
                    </div>
                    <p className="text-[12px] font-bold">{t('why.rank', {rank: info.rank, role: t(`roleOne.${player.role}`), total: info.ofRole, overall: player.scores.overall})}</p>
                    <ul className="flex flex-col gap-1 text-[11px] font-semibold leading-snug list-disc pl-4">
                        {info.why.map((w, i) => <li key={i}>{text(w, info)}</li>)}
                        {strengths.length > 0 && <li className="text-emerald-800">{t('why.strengths', {list: strengths.join(', ')})}</li>}
                        {weaknesses.length > 0 && <li className="text-red-800">{t('why.weaknesses', {list: weaknesses.join(', ')})}</li>}
                        <li className="text-muted-foreground">{t('why.confidence', {level: t(`why.levels.${player.scores.confidence}`), sample: Math.round(player.scores.sample)})}</li>
                    </ul>
                </div>,
                document.body,
            )}
        </>
    );
}

/** Four role columns, players grouped by tier with price and overall; bought players struck through. */
export function TierList({players, infos, prices, bought, targets, onBuy}: {players: AuctionPlayer[]; infos: Map<number, TierInfo>; prices: Map<number, number>; bought: Map<number, {manager: number; price: number}>; targets: Set<number>; onBuy: (player: AuctionPlayer) => void}) {
    const t = useTranslations('Fantasy.tiers');
    const tb = useTranslations('Fantasy.board');
    const tiers = new Map<number, Tier>([...infos].map(([id, info]) => [id, info.tier]));
    const grouped = groupByTier(players, tiers);
    return (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 items-start">
            {ROLES.map((role) => (
                <Panel key={role} title={`${role} · ${t(`roles.${role}`)}`} action={<span className="font-mono text-[11px] text-muted-foreground">{players.filter((p) => p.role === role).length}</span>}>
                    {TIERS.map((tier) => {
                        const list = grouped[role][tier];
                        if (list.length === 0) return null;
                        const shown = CUT[tier] ? list.slice(0, CUT[tier]) : list;
                        return (
                            <div key={tier} className="border-t border-muted first:border-t-0">
                                <div className="flex items-center gap-2 px-3 h-7 bg-muted/40">
                                    <TierBadge tier={tier} short={false} />
                                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{list.length}</span>
                                </div>
                                <ul>
                                    {shown.map((p) => {
                                        const purchase = bought.get(p.id);
                                        return (
                                            <li key={p.id} className={cn("flex items-center gap-2 px-3 h-8 border-t border-muted/60 text-[12px]", purchase && "opacity-50")}>
                                                <Link href={`/players/${p.slug}`} className={cn("font-bold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2", purchase && "line-through")}>{p.name}</Link>
                                                {targets.has(p.id) && !purchase && <span className="bb-badge bg-accent text-[9px] h-4 px-1 shrink-0">★</span>}
                                                <span className="text-[10px] font-semibold text-muted-foreground truncate">{p.team.shortCode ?? p.team.name}</span>
                                                {infos.get(p.id) && <TierWhy player={p} info={infos.get(p.id)!} />}
                                                <span className="ml-auto font-mono text-[11px] font-bold tabular-nums text-muted-foreground">{p.scores.overall}</span>
                                                <span className="font-mono text-[12px] font-extrabold tabular-nums w-8 text-right">{prices.get(p.id) ?? 1}</span>
                                                {!purchase && <button type="button" onClick={() => onBuy(p)} className="bb-btn bg-accent w-7 h-6 inline-flex items-center justify-center text-[14px] leading-none font-extrabold" aria-label={`${tb('buy')} ${p.name}`}>+</button>}
                                            </li>
                                        );
                                    })}
                                    {shown.length < list.length && <li className="px-3 py-1 text-[11px] font-semibold text-muted-foreground">{t('more', {count: list.length - shown.length})}</li>}
                                </ul>
                            </div>
                        );
                    })}
                </Panel>
            ))}
        </div>
    );
}
