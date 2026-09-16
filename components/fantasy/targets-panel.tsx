'use client';

import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {FantaRole} from "@/lib/fantasy/scores";
import type {StrategyPick} from "@/lib/fantasy/strategies";
import {Help} from "./help";
import {RoleBadge} from "./role-badge";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

export interface RivalNote {
    /** The player whose place is contested (mine, or a target). */
    player: AuctionPlayer;
    mine: boolean;
    rivals: Array<{id: number; name: string; bought: {manager: string; price: number} | null; price: number | null}>;
}

/**
 * My targets with their plan B, and the contested places: for every
 * target of the strategy still on the market, whom the strategy would
 * plan in his place if he went to another table (planBFor: the first is
 * the next target, the others follow if he goes too), at their live
 * price; for every contested player of mine or among the targets, who
 * competes for his place, and whether the table has bought him already.
 */
export function TargetsPanel({players, targets, planB, prices, bought, managers, myIds, onBuy, bare = false}: {players: AuctionPlayer[]; targets: StrategyPick[]; /** Per target, the strategy's own replacements, first the next target. */ planB: Map<number, StrategyPick[]>; prices: Map<number, number>; bought: Map<number, {manager: number; price: number}>; managers: string[]; myIds: Set<number>; /** Only the content: the caller draws the frame (a tab of the roster panel). */ bare?: boolean; onBuy: (player: AuctionPlayer) => void}) {
    const t = useTranslations('Fantasy.targets');
    const byId = new Map(players.map((p) => [p.id, p]));
    const open = targets.filter((p) => !bought.has(p.id)).sort((a, b) => b.price - a.price);
    const alternativesOf = (target: StrategyPick): Array<{player: AuctionPlayer; pick: StrategyPick}> =>
        (planB.get(target.id) ?? []).map((pick) => ({player: byId.get(pick.id), pick})).filter((x): x is {player: AuctionPlayer; pick: StrategyPick} => !!x.player && !bought.has(x.pick.id));
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

    const body = (
        <>
            {open.length > 0 && (
                <ul className="flex flex-col divide-y divide-muted">
                    {ROLES.flatMap((role) => open.filter((p) => p.role === role)).map((target) => {
                        const player = byId.get(target.id);
                        if (!player) return null;
                        const alternatives = alternativesOf(target);
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
                                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground" title={t('planBWhy')}>{t('planB')}</span>
                                    {alternatives.length === 0 ? (
                                        <span className="text-[11px] font-semibold text-muted-foreground">{t('planBNone')}</span>
                                    ) : (
                                        alternatives.map(({player: p, pick}, i) => (
                                            <button key={p.id} type="button" onClick={() => onBuy(p)} className={cn(chip, i === 0 && "border-foreground")} title={t(i === 0 ? 'planBFirst' : 'planBHint', {name: p.name, overall: p.scores.overall, fantaAvg: p.scores.fantaAvg?.toFixed(2) ?? '–', maxBid: pick.maxBid})}>
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
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">{t('contested')}<Help text={t('contestedHint')} /></span>
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
                </div>
            )}
        </>
    );
    return bare ? body : <Panel title={t('title')}>{body}</Panel>;
}
