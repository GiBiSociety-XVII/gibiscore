'use client';

import {useState} from "react";
import {useTranslations} from "next-intl";
import {Pencil, Plus, Trash2} from "lucide-react";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {FantaRole} from "@/lib/fantasy/scores";
import {customStrategyKey, PREFER_KEYS, type CustomStrategy, type PreferKey} from "@/lib/fantasy/config";
import {customFrom, FORMATIONS, newCustomId, type FormationKey, type HealthReason, type HealthStatus, type StrategyHealth, type StrategyKey, type StrategyPlan} from "@/lib/fantasy/strategies";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const ROLE_BAR: Record<FantaRole, string> = {P: 'bg-amber-300', D: 'bg-emerald-300', C: 'bg-sky-300', A: 'bg-rose-300'};
export const HEALTH_CLASS: Record<HealthStatus, string> = {ok: 'bg-emerald-200', warn: 'bg-amber-200', switch: 'bg-red-200'};
/** How concentrated the spending inside a role is, in four steps the editor offers. */
const FOCUS_STEPS: Array<{key: 'flat' | 'mid' | 'star' | 'superstar'; value: number}> = [{key: 'flat', value: 0.2}, {key: 'mid', value: 0.45}, {key: 'star', value: 0.7}, {key: 'superstar', value: 0.85}];

/** A strategy's name: the user's own for his, the translation for the built-in ones. */
export function useStrategyName() {
    const t = useTranslations('Fantasy.strategies');
    return (plan: {key: string; name?: string}) => plan.name ?? t(`${plan.key}.name`);
}

/** One warning of the strategy health, in words. `nameOf` names the strategy a warning points to (a custom one has no translation). */
export function useHealthReason(nameOf?: (key: string) => string) {
    const t = useTranslations('Fantasy.strategies');
    const ts = useTranslations('Fantasy.setup');
    const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
    const name = (key: string) => (nameOf ? nameOf(key) : key.startsWith('custom:') ? t('custom.name') : t(`${key}.name`));
    return (r: HealthReason): string => {
        switch (r.kind) {
            case 'behind': return t('health.reasons.behind', {name: name(r.best), gap: r.gap.toFixed(1), pct: pct(r.pct)});
            case 'drift': return t('health.reasons.drift', {pct: Math.abs(Math.round(r.pct * 100))});
            case 'overspent': return t('health.reasons.overspent', {role: ts(`roles.${r.role}`), spent: r.spent, budget: r.budget});
            case 'starved': return t('health.reasons.starved', {role: ts(`roles.${r.role}`), left: r.left, open: r.open});
            case 'targetsLost': return t('health.reasons.targetsLost', {lost: r.lost, total: r.total});
        }
    };
}

/** How the strategy in use is going: status, the reasons, and the switch when another plan does better from here. */
export function HealthBox({health, onSelect, nameOf}: {health: StrategyHealth; onSelect: (key: StrategyKey) => void; nameOf: (plan: {key: string; name?: string}) => string}) {
    const t = useTranslations('Fantasy.strategies');
    const reason = useHealthReason((key) => nameOf(key === health.best.key ? health.best : key === health.current.key ? health.current : {key}));
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
                    {t('health.switchTo', {name: nameOf(health.best)})} · {health.best.lineupValue.toFixed(1)} · {health.best.formation}
                </button>
            ) : (
                <p className="text-[11px] font-semibold text-muted-foreground">{t('health.keep', {name: nameOf(health.current)})}</p>
            )}
        </div>
    );
}

/**
 * The editor of a strategy of the user's own: the split of the credits
 * between roles (the others give way when one grows, so it always adds
 * up), how concentrated the spending is inside each role, the formations
 * it is built for and what it looks for.
 */
export function StrategyEditor({initial, credits, onSave, onCancel, onDelete}: {initial: CustomStrategy; credits: number; onSave: (custom: CustomStrategy) => void; onCancel: () => void; onDelete?: () => void}) {
    const t = useTranslations('Fantasy.strategies');
    const ts = useTranslations('Fantasy.setup');
    const [draft, setDraft] = useState<CustomStrategy>(initial);
    const pct = (role: FantaRole) => Math.round(draft.share[role] * 100);
    /** Sets one role's share; the other three give or take in proportion so the four still add up to one. */
    const setShare = (role: FantaRole, value: number) => {
        const v = Math.min(0.85, Math.max(0.02, value / 100));
        const others = ROLES.filter((r) => r !== role);
        const rest = others.reduce((sum, r) => sum + draft.share[r], 0);
        const share = {...draft.share, [role]: v};
        for (const r of others) share[r] = rest > 0 ? ((1 - v) * draft.share[r]) / rest : (1 - v) / 3;
        setDraft({...draft, share});
    };
    const focusStep = (role: FantaRole) => FOCUS_STEPS.reduce((best, step) => (Math.abs(step.value - draft.focus[role]) < Math.abs(best.value - draft.focus[role]) ? step : best), FOCUS_STEPS[0]).key;
    const toggleFormation = (key: FormationKey) => setDraft({...draft, formations: draft.formations.includes(key) ? draft.formations.filter((f) => f !== key) : [...draft.formations, key]});
    const chip = (active: boolean) => cn("bb-btn h-7 px-2 text-[11px] font-extrabold", active ? "bg-foreground text-background" : "bg-card");
    const valid = draft.name.trim().length > 0;
    return (
        <form className="flex flex-col gap-3 px-3 py-3" onSubmit={(e) => { e.preventDefault(); if (valid) onSave({...draft, name: draft.name.trim()}); }}>
            <label className="flex flex-col gap-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('editor.name')}</span>
                <input type="text" value={draft.name} maxLength={40} onChange={(e) => setDraft({...draft, name: e.target.value})} placeholder={t('editor.namePlaceholder')} className="bb-input h-9 px-2.5 text-[13px] font-extrabold" autoFocus />
            </label>
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('editor.split')}</span>
                <div className="flex h-5 w-full rounded overflow-hidden border-2 border-foreground font-mono text-[10px] font-extrabold" role="img" aria-label={ROLES.map((r) => `${r} ${pct(r)}%`).join(', ')}>
                    {ROLES.map((r) => (
                        <span key={r} style={{width: `${draft.share[r] * 100}%`}} className={cn("flex items-center justify-center border-r-2 border-foreground last:border-r-0 whitespace-nowrap overflow-hidden", ROLE_BAR[r])}>{r} {pct(r)}%</span>
                    ))}
                </div>
                {ROLES.map((r) => (
                    <label key={r} className="grid grid-cols-[1.5rem_1fr_5.5rem] items-center gap-2">
                        <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded border border-foreground font-mono text-[11px] font-extrabold", ROLE_BAR[r])} title={ts(`roles.${r}`)}>{r}</span>
                        <input type="range" min={2} max={85} step={1} value={pct(r)} onChange={(e) => setShare(r, Number(e.target.value))} aria-label={ts(`roles.${r}`)} className="w-full accent-foreground" />
                        <span className="font-mono text-[12px] font-extrabold tabular-nums text-right whitespace-nowrap">{pct(r)}% <span className="text-muted-foreground font-bold">· {Math.round(credits * draft.share[r])} cr.</span></span>
                    </label>
                ))}
                <span className="text-[10px] font-semibold text-muted-foreground">{t('editor.splitHint')}</span>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('editor.focus')}</span>
                {ROLES.map((r) => (
                    <div key={r} className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded border border-foreground font-mono text-[11px] font-extrabold shrink-0", ROLE_BAR[r])} title={ts(`roles.${r}`)}>{r}</span>
                        <span role="radiogroup" aria-label={ts(`roles.${r}`)} className="flex gap-1 flex-wrap">
                            {FOCUS_STEPS.map((step) => (
                                <button key={step.key} type="button" role="radio" aria-checked={focusStep(r) === step.key} onClick={() => setDraft({...draft, focus: {...draft.focus, [r]: step.value}})} className={chip(focusStep(r) === step.key)} title={t(`editor.focusHint.${step.key}`)}>{t(`editor.focusStep.${step.key}`)}</button>
                            ))}
                        </span>
                    </div>
                ))}
                <span className="text-[10px] font-semibold text-muted-foreground">{t('editor.focusHintAll')}</span>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('editor.formations')}</span>
                <div className="flex flex-wrap gap-1">
                    {FORMATIONS.map((f) => (
                        <button key={f.key} type="button" aria-pressed={draft.formations.includes(f.key)} onClick={() => toggleFormation(f.key)} className={cn(chip(draft.formations.includes(f.key)), "font-mono")}>{f.key}</button>
                    ))}
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground">{t('editor.formationsHint')}</span>
            </div>
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('editor.prefer')}</span>
                <div role="radiogroup" className="flex flex-wrap gap-1">
                    {PREFER_KEYS.map((key: PreferKey) => (
                        <button key={key} type="button" role="radio" aria-checked={draft.prefer === key} onClick={() => setDraft({...draft, prefer: key})} className={chip(draft.prefer === key)} title={t(`editor.preferHint.${key}`)}>{t(`editor.preferKey.${key}`)}</button>
                    ))}
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground">{t(`editor.preferHint.${draft.prefer}`)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-muted">
                {onDelete && <button type="button" onClick={onDelete} className="bb-btn bg-card h-8 px-2.5 text-[12px] font-extrabold inline-flex items-center gap-1 text-red-700"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />{t('editor.delete')}</button>}
                <span className="ml-auto flex gap-1.5">
                    <button type="button" onClick={onCancel} className="bb-btn bg-card h-8 px-3 text-[12px] font-extrabold">{ts('cancel')}</button>
                    <button type="submit" disabled={!valid} className="bb-btn bg-accent h-8 px-3 text-[12px] font-extrabold disabled:opacity-50">{t('editor.save')}</button>
                </span>
            </div>
        </form>
    );
}

/** Ranked strategies for this pool and league: split of the credits, the lineup they buy, "use it" to drive my role budgets; the user's own can be edited and new ones made. */
type Named = {id: number; name: string};

export function StrategyPanel({plans, selected, onSelect, credits, health = null, formation = null, onFormation, wanted = [], avoided = [], onWant, onAvoid, customs = [], onSaveCustom, onDeleteCustom}: {plans: StrategyPlan[]; selected: StrategyKey | null; onSelect: (key: StrategyKey | null) => void; credits: number; health?: StrategyHealth | null; formation?: string | null; onFormation?: (key: string | null) => void; wanted?: Named[]; avoided?: Named[]; onWant?: (id: number) => void; onAvoid?: (id: number) => void; customs?: CustomStrategy[]; onSaveCustom?: (custom: CustomStrategy) => void; onDeleteCustom?: (id: string) => void}) {
    const t = useTranslations('Fantasy.strategies');
    const nameOf = useStrategyName();
    const [open, setOpen] = useState<StrategyKey | null>(selected ?? plans[0]?.key ?? null);
    const [editing, setEditing] = useState<CustomStrategy | null>(null);
    const best = plans[0];
    const chip = (active: boolean) => cn("bb-btn h-7 px-2 font-mono text-[11px] font-extrabold", active ? "bg-accent" : "bg-card");
    const customOf = (plan: StrategyPlan) => customs.find((c) => customStrategyKey(c.id) === plan.key) ?? null;
    /** A copy of a plan's strategy to edit as one's own, with a fresh id. */
    const copyOf = (plan: StrategyPlan) => customFrom(plan.strategy, newCustomId(customs), t('custom.copyName', {name: nameOf(plan)}));
    const blank = (): CustomStrategy => ({id: newCustomId(customs), name: '', base: null, share: {P: 0.07, D: 0.17, C: 0.28, A: 0.48}, focus: {P: 0.6, D: 0.4, C: 0.45, A: 0.45}, formations: [], prefer: 'none'});
    const save = (custom: CustomStrategy) => { onSaveCustom?.(custom); setEditing(null); setOpen(customStrategyKey(custom.id)); };
    const remove = (id: string) => { onDeleteCustom?.(id); setEditing(null); };
    if (editing) {
        const exists = customs.some((c) => c.id === editing.id);
        return (
            <Panel title={exists ? t('editor.titleEdit') : t('editor.titleNew')} action={<span className="text-[11px] font-semibold text-muted-foreground">{t('editor.intro')}</span>}>
                <StrategyEditor key={editing.id} initial={editing} credits={credits} onSave={save} onCancel={() => setEditing(null)} onDelete={exists ? () => remove(editing.id) : undefined} />
            </Panel>
        );
    }
    /** What the strategy is about: the built-in tagline, or for one of the user's own where it came from. */
    const tagline = (plan: StrategyPlan) => {
        if (!plan.available) return t('needsDefence');
        const custom = customOf(plan);
        if (!custom) return t(`${plan.key}.tagline`);
        return custom.base ? t('custom.taglineFrom', {name: t(`${custom.base}.name`)}) : t('custom.tagline');
    };
    const description = (plan: StrategyPlan) => {
        const custom = customOf(plan);
        if (!custom) return t(`${plan.key}.description`);
        const split = ROLES.map((r) => `${r} ${Math.round(custom.share[r] * 100)}%`).join(' · ');
        return t('custom.description', {split, prefer: t(`editor.preferKey.${custom.prefer}`), formations: custom.formations.length > 0 ? custom.formations.join(', ') : t('custom.anyFormation')});
    };
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
            {(onWant || onAvoid) && (
                <div className="px-3 py-2 border-b border-muted flex flex-col gap-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('prefs.title')}</span>
                    {wanted.length === 0 && avoided.length === 0 ? (
                        <span className="text-[11px] font-semibold text-muted-foreground">{t('prefs.empty')}</span>
                    ) : (
                        <div className="flex flex-wrap items-center gap-1">
                            {wanted.map((p) => (
                                <span key={`w${p.id}`} className="inline-flex items-center gap-1 pl-1.5 h-6 rounded border border-foreground bg-foreground text-background text-[11px] font-bold">
                                    ★ {p.name}
                                    {onWant && <button type="button" onClick={() => onWant(p.id)} aria-label={t('prefs.remove', {name: p.name})} className="inline-flex w-5 h-6 items-center justify-center hover:text-accent">×</button>}
                                </span>
                            ))}
                            {avoided.map((p) => (
                                <span key={`a${p.id}`} className="inline-flex items-center gap-1 pl-1.5 h-6 rounded border border-foreground/60 bg-card text-[11px] font-bold text-muted-foreground line-through">
                                    {p.name}
                                    {onAvoid && <button type="button" onClick={() => onAvoid(p.id)} aria-label={t('prefs.remove', {name: p.name})} className="inline-flex w-5 h-6 items-center justify-center no-underline hover:text-foreground">×</button>}
                                </span>
                            ))}
                        </div>
                    )}
                    <span className="text-[10px] font-semibold text-muted-foreground">{t('prefs.hint')}</span>
                </div>
            )}
            {health && <HealthBox health={health} onSelect={(key) => onSelect(key)} nameOf={nameOf} />}
            {onSaveCustom && (
                <div className="px-3 py-2 border-b border-muted flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setEditing(blank())} className="bb-btn bg-accent h-8 px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" aria-hidden="true" />{t('custom.create')}</button>
                    <span className="text-[11px] font-semibold text-muted-foreground">{t('custom.createHint')}</span>
                </div>
            )}
            <ol className="flex flex-col">
                {plans.map((plan, index) => {
                    const isOpen = open === plan.key;
                    const isSelected = selected === plan.key;
                    const custom = customOf(plan);
                    return (
                        <li key={plan.key} className={cn("border-t border-muted first:border-t-0", !plan.available && "opacity-60")}>
                            <button type="button" onClick={() => setOpen(isOpen ? null : plan.key)} aria-expanded={isOpen} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
                                <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-md border-2 border-foreground font-mono text-[12px] font-extrabold", index === 0 && plan.available ? "bg-accent" : "bg-card")}>{index + 1}</span>
                                <span className="flex flex-col leading-tight min-w-0 flex-1">
                                    <span className="text-[13px] font-extrabold truncate">
                                        {nameOf(plan)}
                                        {custom && <span className="ml-1.5 bb-badge bg-foreground text-background text-[9px] h-4 px-1 align-middle">{t('custom.badge')}</span>}
                                        {isSelected && <span className="ml-1.5 bb-badge bg-accent text-[9px] h-4 px-1 align-middle">{t('inUse')}</span>}
                                        {best && plan.key === best.key && plan.available && <span className="ml-1.5 text-[10px] font-bold uppercase text-accent-text">{t('best')}</span>}
                                    </span>
                                    <span className="text-[11px] font-semibold text-muted-foreground truncate">{tagline(plan)}</span>
                                </span>
                                <span className="flex flex-col items-end leading-tight shrink-0">
                                    <span className="font-mono text-[13px] font-extrabold tabular-nums">{plan.lineupValue.toFixed(1)} <span className="text-[11px]">· {plan.formation}</span></span>
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{t('lineupValue')} · {t('formation')}</span>
                                </span>
                            </button>
                            {isOpen && (
                                <div className="px-3 pb-3 flex flex-col gap-2">
                                    <p className="text-[12px] font-semibold leading-snug">{description(plan)}</p>
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
                                                        <span key={p.id} className={cn("inline-flex items-center gap-1 pl-1.5 h-6 rounded border text-[11px] font-bold whitespace-nowrap", p.pinned ? "border-foreground bg-foreground text-background" : i === 0 ? "border-foreground/60 bg-accent/40" : "border-foreground/60 bg-card", !onAvoid && "pr-1.5")} title={`${p.team} · ${t('overallShort')} ${p.overall}${p.pinned ? ` · ${t('pinned')}` : ''}`}>
                                                            {p.pinned && '★ '}{p.name}
                                                            <span className={cn("font-mono text-[10px] tabular-nums", p.pinned ? "text-background/80" : "text-muted-foreground")}>{p.price}</span>
                                                            {onAvoid && !p.pinned && <button type="button" onClick={() => onAvoid(p.id)} aria-label={t('prefs.ignore', {name: p.name})} title={t('prefs.ignore', {name: p.name})} className="inline-flex w-5 h-6 items-center justify-center text-muted-foreground hover:text-foreground">×</button>}
                                                            {onWant && p.pinned && <button type="button" onClick={() => onWant(p.id)} aria-label={t('prefs.remove', {name: p.name})} className="inline-flex w-5 h-6 items-center justify-center hover:text-accent">×</button>}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[11px] font-semibold text-muted-foreground">{t('spent', {spent: plan.spent, credits})}</span>
                                        <span className="ml-auto flex gap-1.5 flex-wrap justify-end">
                                            {onSaveCustom && (custom ? (
                                                <button type="button" onClick={() => setEditing(custom)} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" aria-hidden="true" />{t('custom.edit')}</button>
                                            ) : (
                                                <button type="button" onClick={() => setEditing(copyOf(plan))} title={t('custom.customizeHint')} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" aria-hidden="true" />{t('custom.customize')}</button>
                                            ))}
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
