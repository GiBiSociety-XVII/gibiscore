'use client';

import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import type {TeamReport as Report, RoleReport} from "@/lib/fantasy/report";
import {RoleBadge} from "./role-badge";

/** Mark tone: sure from 70, so-so from 45, weak below. */
const tone = (value: number) => (value >= 70 ? "bg-accent" : value >= 45 ? "bg-accent/45" : "bg-foreground/15");

export function Meter({value, className}: {value: number; className?: string}) {
    return (
        <span className={cn("relative block h-1.5 rounded-full overflow-hidden bg-muted border border-foreground/20", className)} aria-hidden="true">
            <span className={cn("absolute inset-y-0 left-0 rounded-full", tone(value))} style={{width: `${Math.max(0, Math.min(100, value))}%`}} />
        </span>
    );
}

/** One strip for the sidebar: the team's mark, how sure the eleven are, their fantasy average, the shape. The rest is behind a button. */
export function TeamRecap({report, onOpen}: {report: Report; onOpen: () => void}) {
    const t = useTranslations('Fantasy.roster.report');
    const empty = report.filled === 0;
    return (
        <div className="flex items-stretch gap-3 px-3 py-2 text-[12px]">
            <button type="button" onClick={onOpen} className="flex flex-col items-center justify-center shrink-0 w-14 rounded-lg border-2 border-foreground bg-card hover:bg-accent transition-colors" title={t('overallHint')}>
                <span className={cn("font-mono text-2xl font-extrabold tabular-nums leading-none", empty && "text-muted-foreground")}>{empty ? '–' : report.overall}</span>
                <span className="text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground mt-1">{t('overall')}</span>
            </button>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex items-center gap-2" title={t('starterHint')}>
                    <span className="w-16 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('starter')}</span>
                    <Meter value={empty ? 0 : report.starter} className="flex-1" />
                    <span className="w-7 text-right font-mono font-extrabold tabular-nums">{empty ? '–' : report.starter}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                    <span>{t('fantaAvg')} <span className="font-mono font-extrabold tabular-nums text-foreground">{report.fantaAvg === null ? '–' : report.fantaAvg.toFixed(1)}</span></span>
                    <span className="ml-auto whitespace-nowrap" title={t('lineupHint')}>{report.lineup ? <>{report.lineup.formation} <span className="font-mono tabular-nums text-foreground">{report.lineup.value.toFixed(1)}</span></> : t('short', {missing: Math.max(0, 11 - report.filled)})}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                    <span>{t('starters', {count: report.starters})}</span>
                    {report.injured > 0 && <span className="text-red-700">{t('injuredShort', {count: report.injured})}</span>}
                    <button type="button" onClick={onOpen} className="ml-auto text-[11px] font-extrabold text-foreground underline decoration-accent decoration-[2px] underline-offset-2 whitespace-nowrap">{t('open')}</button>
                </div>
            </div>
        </div>
    );
}

/** The team's mark in a tile, the eleven's marks beside it, a line per role: the report card of a roster. */
export function TeamReportCard({report, compact = false}: {report: Report; compact?: boolean}) {
    const t = useTranslations('Fantasy.roster.report');
    const empty = report.filled === 0;
    return (
        <div className={cn("flex flex-col", compact ? "text-[11px]" : "text-[12px]")}>
            <div className="flex items-stretch gap-3 px-3 py-2 border-b border-muted">
                <div className={cn("flex flex-col items-center justify-center shrink-0 rounded-lg border-2 border-foreground bg-card", compact ? "w-14 py-1" : "w-16 py-1.5")} title={t('overallHint')}>
                    <span className={cn("font-mono font-extrabold tabular-nums leading-none", compact ? "text-2xl" : "text-3xl", empty && "text-muted-foreground")}>{empty ? '–' : report.overall}</span>
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground mt-1">{t('overall')}</span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <div className="flex items-center gap-2" title={t('starterHint')}>
                        <span className="w-16 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('starter')}</span>
                        <Meter value={empty ? 0 : report.starter} className="flex-1" />
                        <span className="w-7 text-right font-mono font-extrabold tabular-nums">{empty ? '–' : report.starter}</span>
                    </div>
                    <div className="flex items-center gap-2 font-semibold text-muted-foreground">
                        <span className="w-16 shrink-0 text-[10px] font-extrabold uppercase tracking-wide">{t('fantaAvg')}</span>
                        <span className="font-mono font-extrabold tabular-nums text-foreground">{report.fantaAvg === null ? '–' : report.fantaAvg.toFixed(1)}</span>
                        <span className="ml-auto whitespace-nowrap" title={t('lineupHint')}>
                            {report.lineup ? <>{report.lineup.formation} <span className="font-mono tabular-nums text-foreground">{report.lineup.value.toFixed(1)}</span></> : t('short', {missing: Math.max(0, 11 - report.filled)})}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-semibold text-muted-foreground">
                        <span>{t('filled', {filled: report.filled, total: report.total})}</span>
                        <span>{t('starters', {count: report.starters})}</span>
                        {report.injured > 0 && <span className="text-red-700">{t('injured', {count: report.injured})}</span>}
                        {report.contested > 0 && <span className="text-amber-700">{t('contested', {count: report.contested})}</span>}
                    </div>
                </div>
            </div>
            <div className={cn("grid gap-x-2 px-3 pt-1 text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground", compact ? "grid-cols-[auto_2.6rem_1fr_2rem_2rem_2.4rem]" : "grid-cols-[auto_2.8rem_1fr_2.2rem_2.2rem_2.8rem]")} aria-hidden="true">
                <span className="w-5" />
                <span>{t('colCount')}</span>
                <span>{t('colStarter')}</span>
                <span className="text-right">{t('colStarterShort')}</span>
                <span className="text-right">{t('colOverall')}</span>
                <span className="text-right">{t('colSpent')}</span>
            </div>
            <ul className="flex flex-col divide-y divide-muted">
                {report.roles.map((r) => (
                    <RoleLine key={r.role} line={r} compact={compact} />
                ))}
            </ul>
        </div>
    );
}

function RoleLine({line, compact}: {line: RoleReport; compact: boolean}) {
    const t = useTranslations('Fantasy.roster.report');
    const none = line.count === 0;
    return (
        <li className={cn("grid items-center gap-x-2 px-3", compact ? "py-1 grid-cols-[auto_2.6rem_1fr_2rem_2rem_2.4rem]" : "py-1.5 grid-cols-[auto_2.8rem_1fr_2.2rem_2.2rem_2.8rem]")} title={none ? undefined : t('roleHint', {starters: line.starters, count: line.count, spent: line.spent})}>
            <RoleBadge role={line.role} />
            <span className={cn("font-mono font-extrabold tabular-nums", line.count >= line.slots ? "text-emerald-700" : "")}>{line.count}/{line.slots}</span>
            <span className="flex flex-col gap-0.5 min-w-0">
                <Meter value={none ? 0 : line.starter} />
                <span className="truncate text-[10px] font-semibold text-muted-foreground">
                    {none ? t('none') : line.best ? t('best', {name: line.best.name, overall: line.best.overall}) : ''}
                    {!none && (line.injured > 0 || line.contested > 0) && (
                        <span className={cn("ml-1", line.injured > 0 ? "text-red-700" : "text-amber-700")}>{line.injured > 0 ? t('injuredShort', {count: line.injured}) : t('contestedShort', {count: line.contested})}</span>
                    )}
                </span>
            </span>
            <span className="text-right font-mono font-extrabold tabular-nums" title={t('starter')}>{none ? '–' : line.starter}</span>
            <span className="text-right font-mono font-bold tabular-nums text-muted-foreground" title={t('overallRole')}>{none ? '–' : line.overall}</span>
            <span className="text-right font-mono font-bold tabular-nums text-muted-foreground" title={t('spent')}>{none ? '–' : `${line.spent} cr`}</span>
        </li>
    );
}
