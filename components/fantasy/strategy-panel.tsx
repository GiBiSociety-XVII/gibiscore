'use client';

import {useState} from "react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {FantaRole} from "@/lib/fantasy/scores";
import {FORMATIONS, type HealthReason, type HealthStatus, type StrategyHealth, type StrategyKey, type StrategyPlan} from "@/lib/fantasy/strategies";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const ROLE_BAR: Record<FantaRole, string> = {P: 'bg-amber-300', D: 'bg-emerald-300', C: 'bg-sky-300', A: 'bg-rose-300'};
export const HEALTH_CLASS: Record<HealthStatus, string> = {ok: 'bg-emerald-200', warn: 'bg-amber-200', switch: 'bg-red-200'};

/** One warning of the strategy health, in words. */
export function useHealthReason() {
    const t = useTranslations('Fantasy.strategies');
    const ts = useTranslations('Fantasy.setup');
    const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
    return (r: HealthReason): string => {
        switch (r.kind) {
            case 'behind': return t('health.reasons.behind', {name: t(`${r.best}.name`), gap: r.gap.toFixed(1), pct: pct(r.pct)});
            case 'drift': return t('health.reasons.drift', {pct: Math.abs(Math.round(r.pct * 100))});
            case 'overspent': return t('health.reasons.overspent', {role: ts(`roles.${r.role}`), spent: r.spent, budget: r.budget});
            case 'starved': return t('health.reasons.starved', {role: ts(`roles.${r.role}`), left: r.left, open: r.open});
            case 'targetsLost': return t('health.reasons.targetsLost', {lost: r.lost, total: r.total});
        }
    };
}

/** How the strategy in use is going: status, the reasons, and the switch when another plan does better from here. */
export function HealthBox({health, onSelect}: {health: StrategyHealth; onSelect: (key: StrategyKey) => void}) {
    const t = useTranslations('Fantasy.strategies');
    const reason = useHealthReason();
    const better = health.best.key !== health.current.key && health.gapPct >= 0.02;
    return (
        <div className={cn("mx-3 my-2 rounded-lg border-2 border-foreground px-3 py-2 flex flex-col gap-1.5", HEALTH_CLASS[health.status])}>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-wide">{t('health.title')}</span>
                <span className="bb-badge bg-card text-[10px] h-5 px-1.5">{t(`health.${health.status}`)}</span>
                <span className="ml-auto font-mono text-[12px] font-extrabold tabular-nums">{health.current.lineupValue.toFixed(1)} · {health.current.formation}</span>
            </div>
            {health.reasons.length === 0 ? (
                <p className="text-[12px] font-semibold">{t('health.fine')}</p>
            ) : (
                <ul className="flex flex-col gap-0.5 text-[12px] font-semibold list-disc pl-4">
                    {health.reasons.map((r, i) => <li key={i}>{reason(r)}</li>)}
                </ul>
            )}
            {better ? (
                <button type="button" onClick={() => onSelect(health.best.key)} className="bb-btn bg-card self-start px-3 h-8 text-[12px] font-extrabold">
                    {t('health.switchTo', {name: t(`${health.best.key}.name`)})} · {health.best.lineupValue.toFixed(1)} · {health.best.formation}
                </button>
            ) : (
                <p className="text-[11px] font-semibold text-muted-foreground">{t('health.keep', {name: t(`${health.current.key}.name`)})}</p>
            )}
        </div>
    );
}

/** Ranked strategies for this pool and league: split of the credits, the lineup they buy, "use it" to drive my role budgets. */
export function StrategyPanel({plans, selected, onSelect, credits, health = null, formation = null, onFormation}: {plans: StrategyPlan[]; selected: StrategyKey | null; onSelect: (key: StrategyKey | null) => void; credits: number; health?: StrategyHealth | null; formation?: string | null; onFormation?: (key: string | null) => void}) {
    const t = useTranslations('Fantasy.strategies');
    const [open, setOpen] = useState<StrategyKey | null>(selected ?? plans[0]?.key ?? null);
    const best = plans[0];
    const chip = (active: boolean) => cn("bb-btn h-7 px-2 font-mono text-[11px] font-extrabold", active ? "bg-accent" : "bg-card");
    return (
        <Panel title={t('title')} action={<span className="text-[11px] font-semibold text-muted-foreground">{t('ranked')}</span>}>
            <p className="px-3 py-2 text-[12px] font-semibold text-muted-foreground border-b border-muted">{t('intro')}</p>
            {onFormation && (
                <div className="px-3 py-2 border-b border-muted flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground mr-1">{t('formationPick')}</span>
                    <button type="button" onClick={() => onFormation(null)} className={chip(formation === null)} title={t('formationAutoHint')}>{t('formationAuto')}</button>
                    {FORMATIONS.map((f) => (
                        <button key={f.key} type="button" onClick={() => onFormation(f.key)} className={chip(formation === f.key)}>{f.key}</button>
                    ))}
                    <span className="basis-full text-[11px] font-semibold text-muted-foreground">{formation ? t('formationFixed', {formation}) : t('formationAutoHint')}</span>
                </div>
            )}
            {health && <HealthBox health={health} onSelect={(key) => onSelect(key)} />}
            <ol className="flex flex-col">
                {plans.map((plan, index) => {
                    const isOpen = open === plan.key;
                    const isSelected = selected === plan.key;
                    return (
                        <li key={plan.key} className={cn("border-t border-muted first:border-t-0", !plan.available && "opacity-60")}>
                            <button type="button" onClick={() => setOpen(isOpen ? null : plan.key)} aria-expanded={isOpen} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
                                <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-md border-2 border-foreground font-mono text-[12px] font-extrabold", index === 0 && plan.available ? "bg-accent" : "bg-card")}>{index + 1}</span>
                                <span className="flex flex-col leading-tight min-w-0 flex-1">
                                    <span className="text-[13px] font-extrabold truncate">
                                        {t(`${plan.key}.name`)}
                                        {isSelected && <span className="ml-1.5 bb-badge bg-accent text-[9px] h-4 px-1 align-middle">{t('inUse')}</span>}
                                        {best && plan.key === best.key && plan.available && <span className="ml-1.5 text-[10px] font-bold uppercase text-accent-text">{t('best')}</span>}
                                    </span>
                                    <span className="text-[11px] font-semibold text-muted-foreground truncate">{plan.available ? t(`${plan.key}.tagline`) : t('needsDefence')}</span>
                                </span>
                                <span className="flex flex-col items-end leading-tight shrink-0">
                                    <span className="font-mono text-[13px] font-extrabold tabular-nums">{plan.lineupValue.toFixed(1)} <span className="text-[11px]">· {plan.formation}</span></span>
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{t('lineupValue')} · {t('formation')}</span>
                                </span>
                            </button>
                            {isOpen && (
                                <div className="px-3 pb-3 flex flex-col gap-2">
                                    <p className="text-[12px] font-semibold leading-snug">{t(`${plan.key}.description`)}</p>
                                    {/* Split */}
                                    <div className="flex h-5 w-full rounded overflow-hidden border-2 border-foreground font-mono text-[10px] font-extrabold" role="img" aria-label={ROLES.map((r) => `${r} ${Math.round(plan.share[r] * 100)}%`).join(', ')}>
                                        {ROLES.map((r) => (
                                            <span key={r} style={{width: `${plan.share[r] * 100}%`}} className={cn("flex items-center justify-center border-r-2 border-foreground last:border-r-0 whitespace-nowrap overflow-hidden", ROLE_BAR[r])}>
                                                {r} {Math.round(plan.share[r] * 100)}%
                                            </span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-4 gap-1 text-center">
                                        {ROLES.map((r) => (
                                            <span key={r} className="font-mono text-[11px] font-bold tabular-nums">{plan.budget[r]} cr.</span>
                                        ))}
                                    </div>
                                    {/* Formations */}
                                    <div className="flex flex-wrap items-center gap-1">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground mr-1">{t('formations')}</span>
                                        {plan.formations.map((f, i) => (
                                            <span key={f.key} className={cn("inline-flex items-center gap-1 px-1.5 h-6 rounded border border-foreground/60 font-mono text-[11px] font-bold tabular-nums", i === 0 ? "bg-accent/40" : "bg-card")}>
                                                {f.key} <span className="text-muted-foreground">{f.value.toFixed(1)}</span>
                                            </span>
                                        ))}
                                    </div>
                                    {/* Targets */}
                                    <div className="flex flex-col gap-1.5">
                                        {ROLES.map((r) => (
                                            <div key={r} className="flex flex-wrap items-center gap-1">
                                                <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded border border-foreground font-mono text-[11px] font-extrabold shrink-0", ROLE_BAR[r])}>{r}</span>
                                                {plan.picks[r].length === 0 ? (
                                                    <span className="text-[11px] font-semibold text-muted-foreground">–</span>
                                                ) : (
                                                    plan.picks[r].map((p, i) => (
                                                        <span key={p.id} className={cn("inline-flex items-center gap-1 px-1.5 h-6 rounded border border-foreground/60 text-[11px] font-bold whitespace-nowrap", i === 0 ? "bg-accent/40" : "bg-card")} title={`${p.team} · ${t('overallShort')} ${p.overall}`}>
                                                            {p.name}
                                                            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{p.price}</span>
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[11px] font-semibold text-muted-foreground">{t('spent', {spent: plan.spent, credits})}</span>
                                        <span className="ml-auto flex gap-1.5">
                                            {isSelected ? (
                                                <button type="button" onClick={() => onSelect(null)} className="bb-btn bg-card px-3 h-8 text-[12px] font-extrabold">{t('stopUsing')}</button>
                                            ) : (
                                                <button type="button" disabled={!plan.available} onClick={() => onSelect(plan.key)} className="bb-btn bg-accent px-3 h-8 text-[12px] font-extrabold">{t('use')}</button>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
            <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('hint')}</p>
        </Panel>
    );
}
