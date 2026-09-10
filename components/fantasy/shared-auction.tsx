'use client';

import {useEffect, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {TeamCrest} from "@/components/football/team-crest";
import type {AuctionPlayer, AuctionPool} from "@/lib/fantasy/data";
import {loadShared} from "@/lib/fantasy/cloud";
import type {SharedAuction} from "@/lib/fantasy/shared";
import type {FantaRole} from "@/lib/fantasy/scores";
import {RoleBadge} from "./role-badge";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
/** The page asks for the auction again this often. */
const REFRESH_MS = 20_000;

/**
 * The auction as the group sees it: every manager with credits and
 * roster, the last purchases, refreshed on its own. Read-only, by link.
 */
export function SharedAuctionView({pool, token, initial}: {pool: AuctionPool; token: string; initial: SharedAuction}) {
    const t = useTranslations('Fantasy.shared');
    const ts = useTranslations('Fantasy.setup');
    const format = useFormatter();
    const [auction, setAuction] = useState<SharedAuction>(initial);
    const [gone, setGone] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        let alive = true;
        const tick = async () => {
            try {
                const next = await loadShared(token);
                if (!alive) return;
                if (next) setAuction(next);
                else setGone(true);
            } catch {
                // A failed refresh keeps the last state; the next one may succeed.
            }
            if (alive) setNow(Date.now());
        };
        const timer = window.setInterval(() => void tick(), REFRESH_MS);
        return () => {
            alive = false;
            window.clearInterval(timer);
        };
    }, [token]);

    const byId = new Map(pool.players.map((p) => [p.id, p]));
    const managers = auction.managers.length > 0 ? auction.managers : [t('manager', {n: 1})];
    const rosterOf = (manager: number) => auction.purchases.filter((p) => p.manager === manager && byId.has(p.playerId));
    const spentOf = (manager: number) => rosterOf(manager).reduce((s, p) => s + p.price, 0);
    const totalSlots = ROLES.reduce((s, r) => s + auction.slots[r], 0);
    const tableSpent = auction.purchases.reduce((s, p) => s + p.price, 0);
    const tableMoney = auction.credits * Math.max(auction.participants, managers.length);
    const last = auction.purchases.slice(-5).reverse();
    const cards = managers.map((name, manager) => ({name, manager, spent: spentOf(manager), roster: rosterOf(manager)})).sort((a, b) => b.roster.length - a.roster.length || b.spent - a.spent);

    return (
        <div className="flex flex-col gap-3">
            <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-extrabold truncate">{auction.name}</span>
                <span className="text-[11px] font-semibold text-muted-foreground">· {ts(`modes.${auction.mode}`)} · {managers.length} × {auction.credits} cr.</span>
                <span className="ml-auto text-[11px] font-semibold text-muted-foreground" title={t('refreshHint')}>
                    {gone ? <span className="text-red-700 font-bold">{t('gone')}</span> : t('updated', {when: format.relativeTime(new Date(auction.updatedAt), now)})}
                </span>
            </div>

            <div className="grid gap-3 grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] items-start">
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                    {cards.map(({name, manager, spent, roster}) => {
                        const left = auction.credits - spent;
                        const done = roster.length >= totalSlots;
                        return (
                            <Panel key={manager} title={name} action={<span className={cn("font-mono text-[12px] font-extrabold tabular-nums", left < 0 && "text-red-700")}>{left} cr.</span>}>
                                <div className="grid grid-cols-4 divide-x divide-muted border-b border-muted text-center">
                                    {ROLES.map((r) => {
                                        const count = roster.filter((p) => byId.get(p.playerId)!.role === r).length;
                                        return (
                                            <div key={r} className="px-1 py-1 flex flex-col items-center gap-0.5">
                                                <RoleBadge role={r} />
                                                <span className={cn("font-mono text-[11px] font-extrabold tabular-nums", count >= auction.slots[r] && "text-muted-foreground")}>{count}/{auction.slots[r]}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="px-3 py-1 text-[11px] font-semibold text-muted-foreground border-b border-muted">{t('spent', {spent, credits: auction.credits})}{done ? ` · ${t('done')}` : ''}</p>
                                {roster.length === 0 ? (
                                    <p className="px-3 py-2 text-[12px] font-semibold text-muted-foreground">{t('empty')}</p>
                                ) : (
                                    <ul className="flex flex-col">
                                        {ROLES.flatMap((r) => roster.filter((pu) => byId.get(pu.playerId)!.role === r).sort((a, b) => b.price - a.price).map((pu) => {
                                            const p = byId.get(pu.playerId) as AuctionPlayer;
                                            return (
                                                <li key={pu.playerId} className="flex items-center gap-2 px-3 h-7 border-t border-muted first:border-t-0">
                                                    <RoleBadge role={p.role} />
                                                    <TeamCrest team={p.team} size={14} />
                                                    <Link href={`/players/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.name}</Link>
                                                    <span className="ml-auto font-mono text-[12px] font-extrabold tabular-nums">{pu.price}</span>
                                                </li>
                                            );
                                        }))}
                                    </ul>
                                )}
                            </Panel>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-3">
                    <Panel title={t('table')}>
                        <div className="px-3 py-2 flex flex-col gap-1 text-[12px] font-semibold">
                            <span>{t('tableMoney', {left: tableMoney - tableSpent, total: tableMoney})}</span>
                            <span className="text-muted-foreground">{t('tablePurchases', {count: auction.purchases.length, total: totalSlots * managers.length})}</span>
                        </div>
                    </Panel>
                    <Panel title={t('last')}>
                        {last.length === 0 ? (
                            <p className="px-3 py-2 text-[12px] font-semibold text-muted-foreground">{t('empty')}</p>
                        ) : (
                            <ul className="flex flex-col">
                                {last.map((pu, i) => {
                                    const p = byId.get(pu.playerId);
                                    if (!p) return null;
                                    return (
                                        <li key={`${pu.playerId}-${i}`} className={cn("flex items-center gap-2 px-3 h-8 border-t border-muted first:border-t-0", i === 0 && "bg-accent/20")}>
                                            <RoleBadge role={p.role} />
                                            <span className="text-[12px] font-bold truncate">{p.name}</span>
                                            <span className="text-[11px] font-semibold text-muted-foreground truncate">{managers[pu.manager] ?? ''}</span>
                                            <span className="ml-auto font-mono text-[12px] font-extrabold tabular-nums">{pu.price}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Panel>
                    <p className="text-[11px] font-semibold text-muted-foreground">{t('footer')}</p>
                </div>
            </div>
        </div>
    );
}
