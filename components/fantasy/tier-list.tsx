'use client';

import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {FantaRole} from "@/lib/fantasy/scores";
import {TIERS, groupByTier, type Tier} from "@/lib/fantasy/tiers";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

export const TIER_CLASS: Record<Tier, string> = {
    top: 'bg-foreground text-background border-foreground',
    semiTop: 'bg-accent border-foreground',
    first: 'bg-accent/45 border-foreground/70',
    second: 'bg-muted border-foreground/50',
    third: 'bg-card border-foreground/40',
    filler: 'bg-card border-dashed border-foreground/30 text-muted-foreground',
};

export function TierBadge({tier, short = true, className}: {tier: Tier; short?: boolean; className?: string}) {
    const t = useTranslations('Fantasy.tiers');
    return <span className={cn("inline-flex items-center justify-center h-5 px-1.5 rounded border text-[10px] font-extrabold uppercase tracking-wide whitespace-nowrap", TIER_CLASS[tier], className)} title={t(`${tier}.name`)}>{short ? t(`${tier}.short`) : t(`${tier}.name`)}</span>;
}

/** Four role columns, players grouped by tier with price and overall; bought players struck through. */
export function TierList({players, tiers, prices, bought, targets, onBuy}: {players: AuctionPlayer[]; tiers: Map<number, Tier>; prices: Map<number, number>; bought: Map<number, {manager: number; price: number}>; targets: Set<number>; onBuy: (player: AuctionPlayer) => void}) {
    const t = useTranslations('Fantasy.tiers');
    const tb = useTranslations('Fantasy.board');
    const grouped = groupByTier(players, tiers);
    return (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 items-start">
            {ROLES.map((role) => (
                <Panel key={role} title={`${role} · ${t(`roles.${role}`)}`} action={<span className="font-mono text-[11px] text-muted-foreground">{players.filter((p) => p.role === role).length}</span>}>
                    {TIERS.map((tier) => {
                        const list = grouped[role][tier];
                        if (list.length === 0) return null;
                        const shown = tier === 'filler' ? list.slice(0, 12) : list;
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
                                                <span className="ml-auto font-mono text-[11px] font-bold tabular-nums text-muted-foreground">{p.scores.overall}</span>
                                                <span className="font-mono text-[12px] font-extrabold tabular-nums w-8 text-right">{prices.get(p.id) ?? 1}</span>
                                                {!purchase && <button type="button" onClick={() => onBuy(p)} className="bb-btn bg-accent w-7 h-6 inline-flex items-center justify-center text-[14px] leading-none font-extrabold" aria-label={`${tb('buy')} ${p.name}`}>+</button>}
                                            </li>
                                        );
                                    })}
                                    {shown.length < list.length && <li className="px-3 py-1 text-[11px] font-semibold text-muted-foreground">{t('moreFillers', {count: list.length - shown.length})}</li>}
                                </ul>
                            </div>
                        );
                    })}
                </Panel>
            ))}
        </div>
    );
}
