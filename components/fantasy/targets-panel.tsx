'use client';

import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {FantaRole} from "@/lib/fantasy/scores";
import {playerValue, type StrategyPick} from "@/lib/fantasy/strategies";
import {RoleBadge} from "./role-badge";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
/** Plan B may cost up to this much more than the target's ceiling. */
const PLAN_B_STRETCH = 1.15;
const PLAN_B_COUNT = 3;

export interface RivalNote {
    /** The player whose place is contested (mine, or a target). */
    player: AuctionPlayer;
    mine: boolean;
    rivals: Array<{id: number; name: string; bought: {manager: string; price: number} | null; price: number | null}>;
}

/**
 * My targets with their plan B, and the contested places: for every
 * target of the strategy still on the market, the players of the role
 * who could take its slot if it goes elsewhere, at their live price; for
 * every contested player of mine or among the targets, who competes for
 * his place, and whether the table has bought him already.
 */
export function TargetsPanel({players, targets, prices, bought, avoided, managers, myIds, onBuy}: {players: AuctionPlayer[]; targets: StrategyPick[]; prices: Map<number, number>; bought: Map<number, {manager: number; price: number}>; avoided: Set<number>; managers: string[]; myIds: Set<number>; onBuy: (player: AuctionPlayer) => void}) {
    const t = useTranslations('Fantasy.targets');
    const byId = new Map(players.map((p) => [p.id, p]));
    const targetIds = new Set(targets.map((p) => p.id));
    const open = targets.filter((p) => !bought.has(p.id)).sort((a, b) => b.price - a.price);
    // Plan B: the best of the role still on the market, within the target's ceiling and a bit, not a target himself.
    const planB = (target: StrategyPick): AuctionPlayer[] =>
        players
            .filter((p) => p.role === target.role && p.id !== target.id && !bought.has(p.id) && !avoided.has(p.id) && !targetIds.has(p.id) && (prices.get(p.id) ?? 1) <= Math.max(2, Math.round(target.maxBid * PLAN_B_STRETCH)) && !p.injury?.longTerm)
            .sort((a, b) => playerValue(b) - playerValue(a) || b.scores.overall - a.scores.overall)
            .slice(0, PLAN_B_COUNT);
    const managerName = (i: number) => managers[i] ?? '';
    const contested: RivalNote[] = [...myIds, ...open.map((p) => p.id)]
        .map((id) => byId.get(id))
        .filter((p): p is AuctionPlayer => !!p && p.contested && p.rivals.length > 0)
        .map((p) => ({
            player: p,
            mine: myIds.has(p.id),
            rivals: p.rivals.map((r) => {
                const purchase = bought.get(r.id);
                return {id: r.id, name: r.name, bought: purchase ? {manager: managerName(purchase.manager), price: purchase.price} : null, price: byId.has(r.id) ? (prices.get(r.id) ?? 1) : null};
            }),
        }));
    if (open.length === 0 && contested.length === 0) return null;
    const chip = "inline-flex items-center gap-1 h-6 px-1.5 rounded border border-foreground/40 bg-card text-[11px] font-bold hover:bg-accent";

    return (
        <Panel title={t('title')}>
            {open.length > 0 && (
                <ul className="flex flex-col divide-y divide-muted">
                    {ROLES.flatMap((role) => open.filter((p) => p.role === role)).map((target) => {
                        const player = byId.get(target.id);
                        if (!player) return null;
                        const alternatives = planB(target);
                        return (
                            <li key={target.id} className="px-3 py-1.5 flex flex-col gap-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <RoleBadge role={target.role} />
                                    <Link href={`/players/${player.slug}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-extrabold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{player.name}</Link>
                                    {target.pinned && <span className="bb-badge bg-foreground text-background text-[9px] h-4 px-1 shrink-0">★</span>}
                                    <span className="ml-auto font-mono text-[11px] font-bold tabular-nums whitespace-nowrap" title={t('priceHint')}>{prices.get(target.id) ?? 1} <span className="text-muted-foreground">/ {target.maxBid}</span></span>
                                    <button type="button" onClick={() => onBuy(player)} className="bb-btn bg-accent h-6 px-2 text-[10px] font-extrabold">{t('buy')}</button>
                                </div>
                                <div className="flex flex-wrap items-center gap-1 pl-7">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('planB')}</span>
                                    {alternatives.length === 0 ? (
                                        <span className="text-[11px] font-semibold text-muted-foreground">{t('planBNone')}</span>
                                    ) : (
                                        alternatives.map((p) => (
                                            <button key={p.id} type="button" onClick={() => onBuy(p)} className={chip} title={t('planBHint', {name: p.name, overall: p.scores.overall, fantaAvg: p.scores.fantaAvg?.toFixed(2) ?? '–'})}>
                                                <span className="truncate max-w-[110px]">{p.name}</span>
                                                <span className="font-mono tabular-nums text-muted-foreground">{prices.get(p.id) ?? 1}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            {contested.length > 0 && (
                <div className={cn("px-3 py-2 flex flex-col gap-1", open.length > 0 && "border-t-2 border-foreground")}>
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('contested')}</span>
                    <ul className="flex flex-col gap-1">
                        {contested.map(({player, mine, rivals}) => (
                            <li key={player.id} className="text-[11px] font-semibold flex flex-wrap items-center gap-1">
                                <RoleBadge role={player.role} />
                                <span className={cn("font-extrabold", mine && "underline decoration-accent decoration-[2px] underline-offset-2")}>{player.name}</span>
                                <span className="text-muted-foreground">{t('with')}</span>
                                {rivals.map((r) => (
                                    <span key={r.id} className={cn("inline-flex items-center gap-1 h-5 px-1.5 rounded border text-[10px] font-bold", r.bought ? "border-red-700 bg-red-100 text-red-800" : "border-foreground/30 bg-card")} title={r.bought ? t('rivalTaken', {name: r.name, manager: r.bought.manager, price: r.bought.price}) : r.price !== null ? t('rivalFree', {name: r.name, price: r.price}) : r.name}>
                                        {r.name}
                                        {r.bought ? <span>· {r.bought.manager}</span> : r.price !== null ? <span className="font-mono tabular-nums text-muted-foreground">{r.price}</span> : null}
                                    </span>
                                ))}
                            </li>
                        ))}
                    </ul>
                    <span className="text-[10px] font-semibold text-muted-foreground">{t('contestedHint')}</span>
                </div>
            )}
        </Panel>
    );
}
