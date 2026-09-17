'use client';

import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import type {LegKey} from "@/lib/football/markets";

export interface TicketSelection {
    fixtureId: number;
    home: string;
    away: string;
    competition: string;
    startingAt: string;
    tier: 'safe' | 'balanced' | 'bold';
    banker?: boolean;
    legs: Array<{key: LegKey; pct: number}>;
    pct: number;
}

export interface TicketLine {
    k: number;
    n: number;
    columns: number;
    /** Per column. */
    stake: number;
}

/** A saved slip as the ticket shows it (schedine row, numbers parsed). */
export interface Ticket {
    id: number;
    kind: 'single' | 'multiple' | 'system';
    risk: 'low' | 'medium' | 'high';
    size: number;
    systemOf: number | null;
    selections: TicketSelection[];
    pct: number;
    fair: number;
    book: number | null;
    stake: number | null;
    payout: number | null;
    lines: TicketLine[] | null;
    lastKickoff: string;
    createdAt: string;
    hits: number | null;
    hit: boolean | null;
}

/** The pick of a leg in words, from the markets' labels. */
export function useLegLabel() {
    const tm = useTranslations('Football.markets');
    return (key: LegKey) => (key === 'btts' ? tm('labels.goal') : key === 'noBtts' ? tm('labels.noGoal') : key.startsWith('over') ? tm('labels.over', {line: `${key.slice(4, 5)},${key.slice(5)}`}) : key.startsWith('under') ? tm('labels.under', {line: `${key.slice(5, 6)},${key.slice(6)}`}) : key);
}

/** A slip is settled two hours after its last kick-off (advice.ts). */
const SETTLE_AFTER_MS = 2 * 3_600_000;

/**
 * A saved slip drawn as the ticket a bookmaker prints: the header with
 * its number and date, the selections one under the other, the tear
 * line, the stake and what it pays, the stamp of how it went.
 */
export function SchedinaTicket({ticket}: {ticket: Ticket}) {
    const t = useTranslations('Pages.predictions.mine');
    const ts = useTranslations('Pages.predictions.schedina');
    const tm = useTranslations('Football.markets');
    const format = useFormatter();
    const legLabel = useLegLabel();
    const status = ticket.hit === null ? 'open' : ticket.hit ? 'won' : 'lost';
    const priced = ticket.book !== null;
    const odds = ticket.book ?? ticket.fair;
    const settles = new Date(Date.parse(ticket.lastKickoff) + SETTLE_AFTER_MS);
    const lines = (ticket.lines ?? []).filter((l) => l.stake > 0);
    const cell = (label: string, value: string) => (
        <div className="flex flex-col items-center justify-center px-1 py-1.5 border-l border-dashed border-foreground/30 first:border-l-0">
            <span className="font-mono text-[15px] font-extrabold tabular-nums">{value}</span>
            <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground text-center leading-tight">{label}</span>
        </div>
    );
    return (
        <article className="relative bb-surface bg-background overflow-hidden flex flex-col" aria-label={t('ticket.number', {id: ticket.id})}>
            <span
                aria-hidden="true"
                className={cn(
                    "absolute right-3 top-10 z-10 -rotate-12 px-2 py-0.5 rounded border-[3px] font-black uppercase tracking-[0.2em] text-[13px] pointer-events-none",
                    status === 'won' ? "border-emerald-700 text-emerald-700 bg-emerald-50/90" : status === 'lost' ? "border-red-700 text-red-700 bg-red-50/90" : "border-foreground/40 text-foreground/50 bg-background/80",
                )}
            >
                {t(status)}
            </span>
            <header className="px-3 h-9 flex items-center justify-between gap-2 bg-foreground text-background">
                <span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.15em] truncate">{t('ticket.number', {id: ticket.id})}</span>
                <span className="font-mono text-[10px] font-bold shrink-0">{format.dateTime(new Date(ticket.createdAt), {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'})}</span>
            </header>
            <div className="px-3 py-1.5 flex items-center gap-1.5 flex-wrap border-b border-dashed border-foreground/40">
                <span className="inline-flex items-center h-5 px-1.5 rounded border-2 border-foreground bg-accent text-[10px] font-extrabold uppercase tracking-wide">{ts(`kinds.${ticket.kind}`)}{ticket.systemOf ? ` ${ticket.systemOf}/${ticket.size}` : ''}</span>
                <span className="inline-flex items-center h-5 px-1.5 rounded border-2 border-foreground bg-card text-[10px] font-extrabold uppercase tracking-wide">{ts(`risks.${ticket.risk}`)}</span>
                <span className="ml-auto font-mono text-[10px] font-bold text-muted-foreground">{ts('selections', {count: ticket.size})}</span>
            </div>
            <ul className="flex flex-col divide-y divide-dashed divide-foreground/25">
                {ticket.selections.map((s) => (
                    <li key={s.fixtureId} className="px-3 py-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                        <span className="w-11 flex flex-col leading-tight font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
                            <span className="uppercase">{format.dateTime(new Date(s.startingAt), {weekday: 'short', day: 'numeric'})}</span>
                            <span>{format.dateTime(new Date(s.startingAt), {hour: '2-digit', minute: '2-digit'})}</span>
                        </span>
                        <span className="min-w-0 flex flex-col leading-tight">
                            <Link href={`/matches/${s.fixtureId}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-extrabold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{s.home} – {s.away}</Link>
                            <span className="text-[10px] font-semibold text-muted-foreground truncate">
                                {s.banker && <span className="inline-flex items-center h-4 px-1 mr-1 rounded border border-foreground bg-accent text-[9px] font-extrabold uppercase tracking-wide text-foreground">{ts('banker')}</span>}
                                {s.competition} · {tm(`advice.tiers.${s.tier}`)}
                            </span>
                        </span>
                        <span className="text-right leading-tight">
                            <span className="block text-[13px] font-extrabold whitespace-nowrap">{s.legs.map((l) => legLabel(l.key)).join(' + ')}</span>
                            <span className="block font-mono text-[10px] font-bold tabular-nums text-muted-foreground">{s.pct}%</span>
                        </span>
                    </li>
                ))}
            </ul>
            {/* The tear line. */}
            <div className="relative h-5 shrink-0" aria-hidden="true">
                <div className="absolute inset-x-4 top-1/2 border-t-2 border-dashed border-foreground/60" />
                <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted border-2 border-foreground" />
                <span className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted border-2 border-foreground" />
            </div>
            {lines.length > 0 && (
                <div className="px-3 pb-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                    {lines.map((l) => (
                        <span key={l.k} className="flex items-center justify-between gap-2 font-mono tabular-nums">
                            <span className="font-sans font-extrabold">{ts('kOfN', {k: l.k, n: l.n})} <span className="font-normal text-muted-foreground">×{l.columns}</span></span>
                            <span className="whitespace-nowrap">{l.stake.toFixed(2)} €<span className="text-muted-foreground">{t('ticket.perColumn')}</span></span>
                        </span>
                    ))}
                </div>
            )}
            <div className="grid grid-cols-4 border-t border-dashed border-foreground/40">
                {cell(t('ticket.odds'), `${priced ? '' : '≈'}${odds.toFixed(2)}`)}
                {cell(ts('chance'), `${ticket.pct}%`)}
                {cell(t('ticket.stake'), ticket.stake !== null ? `${ticket.stake.toFixed(2)} €` : '–')}
                {cell(t('ticket.payout'), ticket.payout !== null ? `${priced ? '' : '≈'}${ticket.payout.toFixed(2)} €` : '–')}
            </div>
            <footer className="px-3 py-1.5 border-t-2 border-foreground bg-card flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <span className="truncate">
                    {status === 'open'
                        ? `${t('ticket.settles')} ${format.dateTime(settles, {weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}`
                        : `${t('ticket.settled')}${ticket.hits !== null ? ` · ${t('hits', {hits: ticket.hits, size: ticket.size})}` : ''}`}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[9px] font-extrabold tracking-[0.2em] text-foreground">GIBISCORE</span>
                    <span aria-hidden="true" className="flex items-end gap-px h-4">
                        {Array.from({length: 24}, (_, i) => <span key={i} className="bg-foreground h-full" style={{width: ((ticket.id * 31 + i * 7) % 3) + 1}} />)}
                    </span>
                </span>
            </footer>
        </article>
    );
}
