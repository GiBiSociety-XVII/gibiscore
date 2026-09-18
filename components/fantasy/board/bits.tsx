'use client';

import {useEffect, useRef} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Badge} from "@/components/shared/ui/badge";
import {cn} from "@/components/shared/ui/cn";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {Bargain} from "@/lib/fantasy/bargains";

export function ScoreCell({value}: {value: number}) {
    return (
        <span className="relative inline-flex items-center justify-center w-9 h-6 rounded overflow-hidden border border-foreground/30 bg-muted/40 font-mono text-[12px] font-extrabold tabular-nums">
            <span className={cn("absolute inset-y-0 left-0", value >= 70 ? "bg-accent" : value >= 45 ? "bg-accent/45" : "bg-foreground/10")} style={{width: `${value}%`}} aria-hidden="true" />
            <span className="relative">{value}</span>
        </span>
    );
}

export const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Absence badge (no return date: nobody can tell one), plus the small flags that matter at the auction. */
export type Verdict = 'great' | 'ok' | 'pricey' | 'avoid';
export const VERDICT_CLASS: Record<Verdict, string> = {great: "bg-emerald-200 border-emerald-700", ok: "bg-emerald-100 border-emerald-700/60", pricey: "bg-amber-200 border-amber-700", avoid: "bg-red-200 border-red-700"};

/**
 * One word on whether to buy him at the live price: with a strategy, the
 * ceiling it would pay against the price; without, where the site ranks
 * him against where the list does.
 */
export function verdictOf(price: number, maxBid: number | null, deal: Bargain | undefined): Verdict | null {
    if (maxBid !== null) {
        const ratio = maxBid / Math.max(1, price);
        return ratio >= 1.15 ? 'great' : ratio >= 0.95 ? 'ok' : ratio >= 0.75 ? 'pricey' : 'avoid';
    }
    if (!deal) return null;
    return deal.index >= 1.3 ? 'great' : deal.index <= 0.75 ? 'pricey' : null;
}

export function Status({p, rivals, rivalsTaken = [], deal, verdict}: {p: AuctionPlayer; rivals: AuctionPlayer['rivals']; rivalsTaken?: string[]; deal?: Bargain; verdict?: Verdict | null}) {
    const t = useTranslations('Fantasy.board');
    return (
        <span className="inline-flex items-center gap-1 flex-wrap justify-end">
            {verdict && <Badge variant="outline" className={cn("text-[9px] h-4 px-1 font-extrabold", VERDICT_CLASS[verdict])} title={t(`verdict.${verdict}Hint`)}>{t(`verdict.${verdict}`)}</Badge>}
            {deal?.bargain && <Badge variant="ink" className="text-[9px] h-4 px-1 bg-emerald-700 border-emerald-700" title={t('bargain.hint', {quote: deal.quote, equiv: deal.equivQuote, rank: deal.rank, role: p.role})}>{t('bargain.badge')}</Badge>}
            {p.contested && rivalsTaken.length > 0 && <Badge variant="ink" className="text-[9px] h-4 px-1 bg-red-700 border-red-700" title={t('rivalTakenHint', {names: rivalsTaken.join(', ')})}>{t('rivalTakenBadge')}</Badge>}
            {p.injury && (() => {
                const label = p.injury.category === 'suspension' ? t('suspended') : p.injury.category === 'doubtful' ? t('doubtful') : p.injury.category === 'injury' ? t('injured') : t('unavailable');
                return (
                    <span className="inline-flex items-center gap-1" title={`${p.injury.description ?? label} · ${t('daysOut', {count: p.injury.daysOut})}`}>
                        <Badge variant={p.injury.category === 'suspension' ? 'ink' : 'outline'} className="text-[9px] h-4 px-1">{label}</Badge>
                        {p.injury.longTerm && <Badge variant="ink" className="text-[9px] h-4 px-1">{t('longTerm')}</Badge>}
                    </span>
                );
            })()}
            {p.contested && rivals.length > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1" title={t('info.rivals', {names: rivals.map((r) => r.name).join(', ')})}>{t('info.rivalsBadge')}</Badge>}
            {p.newSigning && <Badge variant="outline" className="text-[9px] h-4 px-1" title={t('info.newSigning', {club: p.newSigning})}>{t('info.newSigningBadge')}</Badge>}
            {p.penaltyTaker && <Badge variant="accent" className="text-[9px] h-4 px-1" title={t('info.penaltyTaker')}>{t('info.penaltyBadge')}</Badge>}
        </span>
    );
}

/** The notes of the detail row: absence in full, rivals for the spot, new signing, penalties, European cups. */
export function Notes({p}: {p: AuctionPlayer}) {
    const t = useTranslations('Fantasy.board');
    const ts = useTranslations('Fantasy.setup');
    const format = useFormatter();
    const short = (iso: string) => format.dateTime(day(iso), {day: 'numeric', month: 'short'});
    const lines: Array<{key: string; text: string; tone?: string}> = [];
    const breakdown = (['P', 'D', 'C', 'A'] as const).filter((r) => (p.roleBreakdown[r] ?? 0) > 0).map((r) => `${Math.round(p.roleBreakdown[r]!)} ${ts(`roles.${r}`).toLowerCase()}`).join(', ');
    if (p.roleSource === 'manual') lines.push({key: 'role', text: t('info.roleManual', {role: p.role})});
    else if (p.roleSource === 'listone') lines.push({key: 'role', text: (p.listQuote !== null ? t('info.roleListoneQuote', {role: p.role, quote: p.listQuote}) : t('info.roleListone', {role: p.role})) + (p.listFvm !== null ? ` · ${t('info.fvm', {fvm: p.listFvm})}` : '') + (p.mantraRoles ? ` · ${t('info.mantra', {roles: p.mantraRoles.replace(/;/g, ', ')})}` : '')});
    else if (p.roleSource === 'lineups') lines.push({key: 'role', text: t('info.roleLineups', {role: p.role, breakdown})});
    else lines.push({key: 'role', text: t('info.roleProfile', {role: p.role})});
    if (p.injury) {
        const label = p.injury.category === 'suspension' ? t('suspended') : p.injury.category === 'doubtful' ? t('doubtful') : p.injury.category === 'injury' ? t('injured') : t('unavailable');
        lines.push({key: 'injury', text: t('info.injury', {label, description: p.injury.description ? ` (${p.injury.description})` : '', since: short(p.injury.since), days: t('info.injuryDays', {count: p.injury.daysOut})}) + (p.injury.longTerm ? ` · ${t('longTerm')}` : ''), tone: 'text-red-800'});
    }
    const avail = p.availability.starts + p.availability.benches;
    if (p.contested && p.rivals.length > 0) lines.push({key: 'rivals', text: t('info.contested', {benches: Math.round(p.availability.benches), total: Math.round(avail), names: p.rivals.map((r) => t('info.rivalOne', {name: r.name, shared: r.shared})).join(', ')}), tone: 'text-amber-800'});
    else if (p.contested) lines.push({key: 'rivals', text: t('info.contestedUnknown', {benches: Math.round(p.availability.benches), total: Math.round(avail)}), tone: 'text-amber-800'});
    else if (avail >= 3) lines.push({key: 'rivals', text: t('info.fixedStarter', {starts: Math.round(p.availability.starts), total: Math.round(avail)}) + (p.rivals.length > 0 ? ` ${t('info.backup', {names: p.rivals.map((r) => r.name).join(', ')})}` : '')});
    if (p.newSigning) lines.push({key: 'new', text: t('info.newSigning', {club: p.newSigning})});
    if (p.penaltyTaker) lines.push({key: 'pen', text: t('info.penaltyTaker')});
    if (p.europe) lines.push({key: 'europe', text: t('info.europe', {competition: p.europe})});
    return (
        <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('info.title')}</span>
            {lines.length === 0 ? (
                <span className="text-[12px] font-semibold text-muted-foreground">{t('info.none')}</span>
            ) : (
                <ul className="flex flex-col gap-1 text-[12px] font-semibold">
                    {lines.map((l) => <li key={l.key} className={cn("rounded-md border border-foreground/20 bg-card px-2 py-1 leading-snug", l.tone)}>{l.text}</li>)}
                </ul>
            )}
        </div>
    );
}

/**
 * One star for the plan on a player's row. Grey: nobody proposes him, a
 * click makes him a wanted target the strategies plan in whatever the
 * marks say. Blue: the strategy in use proposes him, a click excludes him
 * so no strategy proposes him again. Black (wanted) or crossed (excluded):
 * a click clears it.
 */
export function PlanStar({wanted, avoided, target, onClick, size = 5}: {wanted: boolean; avoided: boolean; target: boolean; onClick: () => void; size?: 5 | 7}) {
    const t = useTranslations('Fantasy.board');
    const box = size === 7 ? "w-7 h-7 text-[13px]" : "w-5 h-5 text-[11px]";
    const state = wanted ? 'wanted' : avoided ? 'avoided' : target ? 'target' : 'none';
    const look = {
        wanted: "border-foreground bg-foreground text-background",
        avoided: "border-foreground/40 bg-muted text-muted-foreground",
        target: "border-foreground bg-accent text-foreground",
        none: "border-foreground/40 bg-card text-muted-foreground hover:text-foreground",
    }[state];
    return (
        <button type="button" onClick={onClick} aria-pressed={wanted || avoided} title={t(`plan.${state}`)} className={cn("inline-flex items-center justify-center rounded border shrink-0 font-extrabold leading-none", box, look)}>{state === 'avoided' ? '✕' : '★'}</button>
    );
}

/** One window listener for the board's keys; the handler is the latest render's, through a ref. */
export function Hotkeys({onKey}: {onKey: (e: KeyboardEvent) => void}) {
    const latest = useRef(onKey);
    useEffect(() => {
        latest.current = onKey;
    });
    useEffect(() => {
        const handler = (e: KeyboardEvent) => latest.current(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);
    return null;
}

export function FragmentRow({children}: {children: React.ReactNode}) {
    return <>{children}</>;
}
