'use client';

import {ArrowLeftRight, X} from "lucide-react";
import {useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {RoleBadge} from "./role-badge";
import {creditsLeft, ledgerOf, totalSlots, type AuctionConfig, type LedgerEntry, type Purchase} from "@/lib/fantasy/config";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {FantaRole} from "@/lib/fantasy/scores";
import {applyTrade, releasePlayer, tradeIssues, type Trade} from "@/lib/fantasy/trade";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
type Tab = 'trade' | 'release' | 'ledger';

function RosterPick({purchases, byId, chosen, onToggle}: {purchases: Purchase[]; byId: Map<number, AuctionPlayer>; chosen: Set<number>; onToggle: (id: number) => void}) {
    const t = useTranslations('Fantasy.trade');
    if (purchases.length === 0) return <p className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">{t('emptyRoster')}</p>;
    return (
        <ul className="flex flex-col max-h-64 overflow-y-auto">
            {ROLES.flatMap((role) => purchases.filter((pu) => byId.get(pu.playerId)?.role === role).map((pu) => {
                const p = byId.get(pu.playerId)!;
                const on = chosen.has(pu.playerId);
                return (
                    <li key={pu.playerId}>
                        <label className={cn("flex items-center gap-2 px-2 h-8 border-t border-muted first:border-t-0 cursor-pointer", on && "bg-accent/30")}>
                            <input type="checkbox" checked={on} onChange={() => onToggle(pu.playerId)} className="accent-foreground" />
                            <RoleBadge role={p.role} />
                            <span className="text-[12px] font-bold truncate">{p.name}</span>
                            <span className="ml-auto font-mono text-[11px] font-extrabold tabular-nums">{pu.price}</span>
                        </label>
                    </li>
                );
            }))}
        </ul>
    );
}

/**
 * The market after the auction: a trade between two managers (players
 * for players, a balance in credits on top), a release with the refund
 * the league gives (the price paid, half of it, the quotation, or any
 * figure), and the list of the credits moved this way.
 */
export function MarketDialog({config, purchases, byId, managers, me, onApply, onClose}: {config: AuctionConfig; purchases: Purchase[]; byId: Map<number, AuctionPlayer>; managers: string[]; me: number; onApply: (next: {purchases: Purchase[]; ledger: LedgerEntry[]}) => void; onClose: () => void}) {
    const t = useTranslations('Fantasy.trade');
    const ts = useTranslations('Fantasy.setup');
    const format = useFormatter();
    const [tab, setTab] = useState<Tab>('trade');
    const other = managers.findIndex((_, i) => i !== me);
    const [a, setA] = useState(me);
    const [b, setB] = useState(other >= 0 ? other : me);
    const [giveA, setGiveA] = useState<Set<number>>(new Set());
    const [giveB, setGiveB] = useState<Set<number>>(new Set());
    const [balance, setBalance] = useState('0');
    const [payer, setPayer] = useState<'a' | 'b'>('a');
    const [releaseManager, setReleaseManager] = useState(me);
    const [releaseId, setReleaseId] = useState<number | null>(null);
    const [refund, setRefund] = useState('');
    const name = (m: number) => managers[m] ?? `#${m + 1}`;
    const rosterOf = (m: number) => purchases.filter((p) => p.manager === m && byId.has(p.playerId));
    const players = new Map([...byId.values()].map((p) => [p.id, {id: p.id, role: p.role}]));
    const toggle = (set: Set<number>, setter: (s: Set<number>) => void, id: number) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setter(next);
    };

    // The trade as it stands and what it would leave each side with.
    const credits = Math.max(0, Math.round(Number(balance) || 0)) * (payer === 'a' ? 1 : -1);
    const trade: Trade = {a: {manager: a, players: [...giveA].filter((id) => rosterOf(a).some((p) => p.playerId === id))}, b: {manager: b, players: [...giveB].filter((id) => rosterOf(b).some((p) => p.playerId === id))}, credits};
    const issues = tradeIssues(config, purchases, players, trade);
    const after = applyTrade(config, purchases, trade);
    const summary = (m: number) => {
        const roster = after.purchases.filter((p) => p.manager === m);
        return {roles: ROLES.map((r) => ({role: r, count: roster.filter((p) => byId.get(p.playerId)?.role === r).length, max: config.slots[r]})), left: creditsLeft({credits: config.credits, ledger: after.ledger}, after.purchases, m), filled: roster.length};
    };
    const issueText = (i: (typeof issues)[number]) => {
        switch (i.kind) {
            case 'empty': return t('issues.empty');
            case 'same': return t('issues.same');
            case 'notOwned': return t('issues.notOwned', {manager: name(i.manager), name: byId.get(i.playerId)?.name ?? '–'});
            case 'roleFull': return t('issues.roleFull', {manager: name(i.manager), role: ts(`roles.${i.role}`), count: i.count, max: i.max});
            case 'credits': return t('issues.credits', {manager: name(i.manager), left: i.left});
        }
    };
    const confirmTrade = () => {
        if (issues.length > 0) return;
        const note = t('tradeNote', {a: name(a), b: name(b), give: trade.a.players.map((id) => byId.get(id)?.name ?? '').join(', ') || '–', get: trade.b.players.map((id) => byId.get(id)?.name ?? '').join(', ') || '–'});
        onApply(applyTrade(config, purchases, trade, note));
        onClose();
    };

    // A release with its refund.
    const releasing = releaseId !== null ? purchases.find((p) => p.playerId === releaseId && p.manager === releaseManager) ?? null : null;
    const releasingPlayer = releasing ? byId.get(releasing.playerId) ?? null : null;
    const pick = (id: number | null) => {
        setReleaseId(id);
        const pu = id !== null ? purchases.find((p) => p.playerId === id) : null;
        setRefund(pu ? String(pu.price) : '');
    };
    const confirmRelease = () => {
        if (!releasing || !releasingPlayer) return;
        const amount = Math.max(0, Math.round(Number(refund) || 0));
        onApply(releasePlayer(config, purchases, [releasing.playerId], amount, t('releaseNote', {name: releasingPlayer.name, refund: amount, price: releasing.price})));
        setReleaseId(null);
        setRefund('');
    };

    const select = "bb-input h-8 px-2 text-[12px] font-extrabold max-w-full";
    const tabClass = (on: boolean) => cn("bb-btn h-8 px-3 text-[12px] font-extrabold", on ? "bg-foreground text-background" : "bg-card");
    const ledger = [...config.ledger].reverse();

    return (
        <div role="dialog" aria-modal="true" aria-label={t('title')} className="fixed inset-0 z-[60] flex items-start justify-center bg-foreground/40 p-3 overflow-y-auto" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="bb-surface w-full max-w-3xl my-4 bg-background flex flex-col">
                <div className="flex items-center gap-2 px-3 h-11 border-b-2 border-foreground bg-card rounded-t-[calc(var(--radius-lg)-2px)]">
                    <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
                    <h2 className="text-[13px] font-extrabold uppercase tracking-wide">{t('title')}</h2>
                    <div className="ml-2 flex items-center gap-1" role="tablist">
                        {(['trade', 'release', 'ledger'] as Tab[]).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={tabClass(tab === k)}>{t(`tabs.${k}`)}</button>)}
                    </div>
                    <button type="button" onClick={onClose} aria-label={ts('cancel')} className="ml-auto inline-flex w-8 h-8 items-center justify-center rounded-md border-2 border-foreground bg-card"><X className="w-4 h-4" /></button>
                </div>

                {tab === 'trade' && (
                    <div className="p-3 flex flex-col gap-3">
                        <p className="text-[11px] font-semibold text-muted-foreground">{t('tradeHint')}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {([['a', a, setA, giveA, setGiveA], ['b', b, setB, giveB, setGiveB]] as Array<['a' | 'b', number, (m: number) => void, Set<number>, (s: Set<number>) => void]>).map(([side, m, setM, chosen, setChosen]) => (
                                <div key={side} className="bb-surface overflow-hidden">
                                    <div className="flex items-center gap-2 px-2 h-9 border-b-2 border-foreground bg-card">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t(side === 'a' ? 'sideA' : 'sideB')}</span>
                                        <select value={m} onChange={(e) => { setM(Number(e.target.value)); setChosen(new Set()); }} className={select} aria-label={t(side === 'a' ? 'sideA' : 'sideB')}>
                                            {managers.map((n, i) => <option key={i} value={i}>{n}</option>)}
                                        </select>
                                    </div>
                                    <RosterPick purchases={rosterOf(m)} byId={byId} chosen={chosen} onToggle={(id) => toggle(chosen, setChosen, id)} />
                                    <div className="px-2 py-1.5 border-t border-muted text-[11px] font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        {summary(m).roles.map((r) => <span key={r.role} className={cn("font-mono tabular-nums", r.count > r.max && "text-red-700 font-extrabold")}>{r.role} {r.count}/{r.max}</span>)}
                                        <span className={cn("ml-auto font-mono font-extrabold tabular-nums", summary(m).left < 0 && "text-red-700")}>{t('leftAfter', {left: summary(m).left})}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
                            <span className="text-muted-foreground">{t('balance')}</span>
                            <select value={payer} onChange={(e) => setPayer(e.target.value as 'a' | 'b')} className={select} aria-label={t('balanceWho')}>
                                <option value="a">{t('pays', {who: name(a)})}</option>
                                <option value="b">{t('pays', {who: name(b)})}</option>
                            </select>
                            <input type="text" inputMode="numeric" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^\d]/g, ''))} className="bb-input h-8 w-20 px-2 text-right font-mono text-[12px] font-extrabold tabular-nums" aria-label={t('balance')} />
                            <span className="text-muted-foreground">{t('credits')}</span>
                        </div>
                        {issues.length > 0 && <ul className="flex flex-col gap-0.5 text-[11px] font-bold text-red-700">{issues.map((i, k) => <li key={k}>{issueText(i)}</li>)}</ul>}
                        <div className="flex justify-end">
                            <button type="button" onClick={confirmTrade} disabled={issues.length > 0} className="bb-btn bg-accent h-9 px-4 text-[13px] font-extrabold disabled:opacity-40">{t('confirmTrade')}</button>
                        </div>
                    </div>
                )}

                {tab === 'release' && (
                    <div className="p-3 flex flex-col gap-3">
                        <p className="text-[11px] font-semibold text-muted-foreground">{t('releaseHint')}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
                            <select value={releaseManager} onChange={(e) => { setReleaseManager(Number(e.target.value)); pick(null); }} className={select} aria-label={t('manager')}>
                                {managers.map((n, i) => <option key={i} value={i}>{n}</option>)}
                            </select>
                            <select value={releaseId ?? ''} onChange={(e) => pick(e.target.value === '' ? null : Number(e.target.value))} className={select} aria-label={t('player')}>
                                <option value="">{t('pickPlayer')}</option>
                                {ROLES.flatMap((role) => rosterOf(releaseManager).filter((pu) => byId.get(pu.playerId)?.role === role).map((pu) => <option key={pu.playerId} value={pu.playerId}>{role} · {byId.get(pu.playerId)!.name} ({pu.price})</option>))}
                            </select>
                        </div>
                        {releasing && releasingPlayer && (
                            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
                                <span className="text-muted-foreground">{t('refund')}</span>
                                <input type="text" inputMode="numeric" value={refund} onChange={(e) => setRefund(e.target.value.replace(/[^\d]/g, ''))} className="bb-input h-8 w-20 px-2 text-right font-mono text-[12px] font-extrabold tabular-nums" aria-label={t('refund')} />
                                <button type="button" onClick={() => setRefund(String(releasing.price))} className="bb-btn bg-card h-7 px-2 text-[11px] font-extrabold">{t('refundPrice', {price: releasing.price})}</button>
                                <button type="button" onClick={() => setRefund(String(Math.floor(releasing.price / 2)))} className="bb-btn bg-card h-7 px-2 text-[11px] font-extrabold">{t('refundHalf', {price: Math.floor(releasing.price / 2)})}</button>
                                {releasingPlayer.listQuote !== null && <button type="button" onClick={() => setRefund(String(releasingPlayer.listQuote))} className="bb-btn bg-card h-7 px-2 text-[11px] font-extrabold">{t('refundQuote', {quote: releasingPlayer.listQuote})}</button>}
                                <span className="text-muted-foreground">{t('leftAfterRelease', {left: creditsLeft(config, purchases, releaseManager) + (Math.max(0, Math.round(Number(refund) || 0)))})}</span>
                                <button type="button" onClick={confirmRelease} className="bb-btn bg-accent h-9 px-4 text-[13px] font-extrabold ml-auto">{t('confirmRelease')}</button>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'ledger' && (
                    <div className="flex flex-col">
                        <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-muted">{t('ledgerHint')}</p>
                        {ledger.length === 0 ? (
                            <p className="px-3 py-3 text-[12px] font-semibold text-muted-foreground">{t('ledgerEmpty')}</p>
                        ) : (
                            <ul className="flex flex-col divide-y divide-muted">
                                {ledger.map((e, i) => (
                                    <li key={i} className="px-3 py-1.5 flex items-start gap-2 text-[12px]">
                                        <span className={cn("font-mono font-extrabold tabular-nums w-12 text-right shrink-0", e.credits < 0 ? "text-red-700" : "text-emerald-700")}>{e.credits > 0 ? `+${e.credits}` : e.credits}</span>
                                        <span className="flex flex-col min-w-0">
                                            <span className="font-bold">{name(e.manager)} · {t(`kinds.${e.kind}`)}</span>
                                            <span className="text-[11px] font-semibold text-muted-foreground">{e.note}{e.at ? ` · ${format.dateTime(new Date(e.at), {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}` : ''}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="px-3 py-2 text-[11px] font-semibold border-t border-muted flex flex-wrap gap-x-3 gap-y-0.5">
                            {managers.map((n, i) => ledgerOf(config.ledger, i) !== 0 && <span key={i} className="font-mono tabular-nums">{n} {ledgerOf(config.ledger, i) > 0 ? '+' : ''}{ledgerOf(config.ledger, i)}</span>)}
                            <span className="text-muted-foreground">{t('slotsNote', {slots: totalSlots(config.slots)})}</span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
