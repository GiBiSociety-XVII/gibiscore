'use client';

import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import type {ForecastReason, PlayerForecast} from "@/lib/fantasy/matchday";

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function useReasonText() {
    const t = useTranslations('Fantasy.lineup.reasons');
    return (r: ForecastReason): string => {
        switch (r.kind) {
            case 'official': return t(`official.${r.status}`);
            case 'sidelined': return t(r.category === 'injury' ? 'injury' : r.category === 'suspension' ? 'suspension' : 'absent', {detail: r.description ? ` · ${r.description}` : '', long: r.longTerm ? t('longTerm') : ''});
            case 'doubtful': return t('doubtful', {detail: r.description ? ` · ${r.description}` : ''});
            case 'noMatch': return t('noMatch');
            case 'usage': return t('usage', {started: r.started, came: r.came, total: r.total});
            case 'noUsage': return t('noUsage');
            case 'match': return t('match', {where: r.home ? t('home') : t('away'), opponent: r.opponent, win: Math.round(r.win), lambdaFor: r.lambdaFor.toFixed(1), lambdaAgainst: r.lambdaAgainst.toFixed(1)});
            case 'attack': return t(r.factor > 1 ? 'attackUp' : 'attackDown', {pct: Math.round(Math.abs(r.factor - 1) * 100)});
            case 'form': return t('form', {own: r.own, opp: r.opp, of: r.of});
            case 'playerForm': return t('playerForm', {avg: r.avg.toFixed(2), matches: r.matches, base: r.base.toFixed(2)});
            case 'bonusForm': return t('bonusForm', {goals: r.goals, assists: r.assists, matches: r.matches});
            case 'cards': return t(r.factor > 1 ? 'cardsUp' : 'cardsDown', {pct: Math.round(Math.abs(r.factor - 1) * 100)});
            case 'manual': return t('manual');
            case 'cleanSheet': return t('cleanSheet', {pct: r.pct});
            case 'penalty': return t('penalty');
        }
    };
}

export function chanceClass(plays: number): string {
    if (plays >= 0.8) return "bg-emerald-200";
    if (plays >= 0.5) return "bg-amber-200";
    if (plays >= 0.2) return "bg-orange-200";
    return "bg-red-200";
}

/** What travels with a dragged player: his id, as plain text so the browser does the rest. */
export const DRAG_TYPE = 'text/plain';
export function draggedId(e: React.DragEvent): number | null {
    const id = Number(e.dataTransfer.getData(DRAG_TYPE));
    return Number.isInteger(id) && id > 0 ? id : null;
}

export type Tone = 'good' | 'fine' | 'none' | 'bad' | 'worst';
export const TONE_CLASS: Record<Tone, string> = {good: "bg-emerald-200", fine: "bg-emerald-100", none: "bg-card", bad: "bg-red-100", worst: "bg-red-200"};
export function toneOf(v: number, [worst, bad, fine, good]: [number, number, number, number]): Tone {
    if (v >= good) return 'good';
    if (v >= fine) return 'fine';
    if (v <= worst) return 'worst';
    if (v <= bad) return 'bad';
    return 'none';
}

export function Cell({tone, title, children, strong = false}: {tone: Tone; title?: string; children: React.ReactNode; strong?: boolean}) {
    return <span className={cn("bb-badge font-mono tabular-nums h-5 px-1 whitespace-nowrap", strong ? "text-[12px] font-extrabold" : "text-[11px] font-bold", TONE_CLASS[tone])} title={title}>{children}</span>;
}

/** The forecast's reasons, one field each, for the columns. */
export function facts(f: PlayerForecast) {
    const by = <K extends ForecastReason['kind']>(kind: K) => f.reasons.find((r): r is Extract<ForecastReason, {kind: K}> => r.kind === kind);
    return {usage: by('usage'), form: by('form'), playerForm: by('playerForm'), match: by('match'), attack: by('attack'), cleanSheet: by('cleanSheet'), official: by('official'), sidelined: by('sidelined'), doubtful: by('doubtful'), manual: by('manual'), noMatch: by('noMatch'), noUsage: by('noUsage')};
}

export interface Signal {
    key: string;
    label: string;
    tone: Tone;
    title: string;
}

/**
 * What decides the forecast, as a handful of coloured chips: only what is
 * notable (a starter at risk, a hot or cold streak, an easy or hard
 * match, a likely clean sheet, the penalties). The numbers behind every
 * chip sit in its tooltip and in the "why" panel.
 */
export function signalsOf(f: PlayerForecast, x: ReturnType<typeof facts>, t: ReturnType<typeof useTranslations<'Fantasy.lineup'>>, reasonText: (r: ForecastReason) => string): Signal[] {
    const out: Signal[] = [];
    const defensive = f.player.role === 'P' || f.player.role === 'D';
    if (x.usage) {
        const rate = (x.usage.started + 0.5 * x.usage.came) / Math.max(1, x.usage.total);
        if (rate < 0.5) out.push({key: 'usage', label: t('signals.usageLow'), tone: 'worst', title: reasonText(x.usage)});
        else if (rate < 0.8) out.push({key: 'usage', label: t('signals.usageMid'), tone: 'bad', title: reasonText(x.usage)});
    } else if (x.noUsage) out.push({key: 'usage', label: t('signals.usageNone'), tone: 'worst', title: reasonText(x.noUsage)});
    if (x.playerForm) {
        const gap = x.playerForm.avg - x.playerForm.base;
        if (gap >= 0.25) out.push({key: 'form', label: t('signals.formUp'), tone: 'good', title: reasonText(x.playerForm)});
        else if (gap <= -0.25) out.push({key: 'form', label: t('signals.formDown'), tone: 'bad', title: reasonText(x.playerForm)});
    }
    if (x.match) {
        const title = x.cleanSheet ? `${reasonText(x.match)} · ${reasonText(x.cleanSheet)}` : reasonText(x.match);
        if (defensive) {
            if (x.match.lambdaAgainst <= 1.0) out.push({key: 'match', label: t('signals.defenceEasy'), tone: 'good', title});
            else if (x.match.lambdaAgainst >= 1.6) out.push({key: 'match', label: t('signals.defenceHard'), tone: 'bad', title});
        } else {
            if (x.match.lambdaFor >= 1.6) out.push({key: 'match', label: t('signals.attackEasy'), tone: 'good', title});
            else if (x.match.lambdaFor <= 0.9) out.push({key: 'match', label: t('signals.attackHard'), tone: 'bad', title});
        }
    }
    if (f.player.penaltyTaker && f.player.role !== 'P') out.push({key: 'penalty', label: t('signals.penalty'), tone: 'good', title: t('reasons.penalty')});
    return out.slice(0, 3);
}

/** How a substitute gets into the eleven by hand: dragged onto a starter, or placed with a tap; and the way back when he was sent out by hand. */

export interface SwapControls {
    /** Sent to the bench by hand: someone else took his place. */
    benched: boolean;
    onUnbench: () => void;
    /** Start placing him: the starters become the choice of who leaves. */
    onPlace: () => void;
    picking: boolean;
}
/** The drag handlers of a substitute: his id travels with the pointer. */
export function dragProps(id: number, locked: boolean) {
    if (locked) return {};
    return {draggable: true, onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DRAG_TYPE, String(id)); e.dataTransfer.effectAllowed = 'move'; }};
}
