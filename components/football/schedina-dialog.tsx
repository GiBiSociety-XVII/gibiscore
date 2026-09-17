'use client';

import {useEffect, useMemo, useState} from "react";
import {X, Check, CloudOff} from "lucide-react";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {TourLauncher} from "./tour-launcher";
import {cloudUser} from "@/lib/fantasy/cloud";
import type {LegKey} from "@/lib/football/markets";
import {buildSchedina, stakePlan, STAKE_STEP, suggestedStakes, systemGroups, toStakeStep, type Schedina, type SchedinaCandidate, type SchedinaKind, type SchedinaRisk, type StakeMode} from "@/lib/football/schedina";

const RISKS: SchedinaRisk[] = ['low', 'medium', 'high'];
const KINDS: SchedinaKind[] = ['single', 'multiple', 'system'];
/** The guide's stops inside the dialog; the ones after "generate" exist only once a slip is on screen. */
const TOUR_STEPS = ['risk', 'kind', 'days', 'competitions', 'generate', 'result', 'summary', 'stake', 'save'] as const;

/**
 * The slip generator: risk, kind, how many selections, which days and
 * competitions; the model picks the selections it believes in most for
 * that risk (schedina.ts) and shows chance, odds and when the slip is
 * settled. Signed in, the slip can be saved and followed.
 */
export function SchedinaDialog({candidates, days, competitions, onClose}: {candidates: SchedinaCandidate[]; days: Array<{day: string; label: string}>; competitions: Array<{id: number; name: string}>; onClose: () => void}) {
    const t = useTranslations('Pages.predictions.schedina');
    const tm = useTranslations('Football.markets');
    const format = useFormatter();
    const [risk, setRisk] = useState<SchedinaRisk>('medium');
    const [kind, setKind] = useState<SchedinaKind>('multiple');
    const [size, setSize] = useState(3);
    const [system, setSystem] = useState<number | 'auto'>('auto');
    const [bankers, setBankers] = useState<number | 'auto'>('auto');
    const [stake, setStake] = useState(10);
    const [stakeMode, setStakeMode] = useState<StakeMode>('recommended');
    // Stakes per column of each line typed by hand; null = the suggested split.
    const [lineStakes, setLineStakes] = useState<number[] | null>(null);
    const [pickedDays, setPickedDays] = useState<string[]>([]);
    const [pickedLeagues, setPickedLeagues] = useState<number[]>([]);
    const [result, setResult] = useState<Schedina | null | undefined>(undefined);
    const [signedIn, setSignedIn] = useState<boolean | null>(null);
    const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    useEffect(() => {
        let alive = true;
        cloudUser().then((u) => { if (alive) setSignedIn(!!u); }).catch(() => { if (alive) setSignedIn(false); });
        return () => { alive = false; };
    }, []);
    const legLabel = (key: LegKey) => (key === 'btts' ? tm('labels.goal') : key === 'noBtts' ? tm('labels.noGoal') : key.startsWith('over') ? tm('labels.over', {line: `${key.slice(4, 5)},${key.slice(5)}`}) : key.startsWith('under') ? tm('labels.under', {line: `${key.slice(5, 6)},${key.slice(6)}`}) : key);
    const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    const available = useMemo(() => candidates.filter((c) => (pickedDays.length === 0 || pickedDays.includes(c.day)) && (pickedLeagues.length === 0 || pickedLeagues.includes(c.competitionId))).length, [candidates, pickedDays, pickedLeagues]);
    const generate = () => {
        setSave('idle');
        setLineStakes(null);
        setResult(buildSchedina(candidates, {risk, kind, size, system, bankers, days: pickedDays, competitions: pickedLeagues, now: new Date().toISOString()}));
    };
    const persist = async () => {
        if (!result || save === 'saving') return;
        setSave('saving');
        try {
            const res = await fetch('/api/predictions/schedina', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(result)});
            if (res.status === 401) { setSignedIn(false); setSave('error'); return; }
            if (!res.ok) throw new Error(String(res.status));
            setSave('saved');
        } catch {
            setSave('error');
        }
    };
    const chip = (active: boolean) => cn("bb-btn h-8 px-3 text-[12px] font-extrabold", active ? "bg-foreground text-background" : "bg-card");
    const settles = result ? new Date(new Date(result.lastKickoff).getTime() + 2 * 3_600_000) : null;

    return (
        <div role="dialog" aria-modal="true" aria-label={t('title')} className="fixed inset-0 z-[60] flex items-start justify-center bg-foreground/40 p-3 overflow-y-auto" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="bb-surface w-full max-w-2xl my-4 bg-background flex flex-col">
                <div className="flex items-center gap-2 px-3 h-11 border-b-2 border-foreground bg-card rounded-t-[calc(var(--radius-lg)-2px)]">
                    <h2 className="text-[14px] font-extrabold uppercase tracking-wide">{t('title')}</h2>
                    <div className="ml-auto"><TourLauncher storageKey="gibiscore:schedina-tour:v1" label={t('tour.button')} hint={t('tour.open')} steps={TOUR_STEPS.map((key) => ({target: `schedina-${key}`, title: t(`tour.steps.${key}.title`), text: t(`tour.steps.${key}.text`)}))} /></div>
                    <button type="button" onClick={onClose} aria-label={t('close')} className="inline-flex items-center justify-center w-8 h-8 rounded-md border-2 border-foreground bg-background hover:bg-muted"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-3 py-3 flex flex-col gap-3 text-[13px]">
                    <p className="text-[12px] font-semibold text-muted-foreground leading-snug">{t('intro')}</p>
                    <div data-tour="schedina-risk" className="flex flex-col gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('risk')}</span>
                        <div className="flex flex-wrap gap-1">{RISKS.map((r) => <button key={r} type="button" onClick={() => setRisk(r)} className={chip(risk === r)} title={t(`riskHint.${r}`)}>{t(`risks.${r}`)}</button>)}</div>
                    </div>
                    <div data-tour="schedina-kind" className="flex flex-col gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('kind')}</span>
                        <div className="flex flex-wrap items-center gap-1">
                            {KINDS.map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={chip(kind === k)} title={t(`kindHint.${k}`)}>{t(`kinds.${k}`)}</button>)}
                            {kind !== 'single' && (
                                <label className="inline-flex items-center gap-1.5 ml-2 text-[12px] font-bold">
                                    {t('size')}
                                    <input type="number" min={2} max={10} value={size} onChange={(e) => setSize(Math.max(2, Math.min(10, Number(e.target.value) || 2)))} className="bb-input h-8 w-16 px-2 font-mono text-[13px] font-extrabold text-center" />
                                </label>
                            )}
                            {kind === 'system' && (
                                <>
                                    <label className="inline-flex items-center gap-1.5 text-[12px] font-bold">
                                        {t('bankers')}
                                        <select value={bankers} onChange={(e) => setBankers(e.target.value === 'auto' ? 'auto' : Number(e.target.value))} className="bb-input h-8 px-2 text-[12px] font-bold" title={t('bankersHint')}>
                                            <option value="auto">{t('bankersAuto')}</option>
                                            {Array.from({length: Math.max(0, size - 1)}, (_, i) => i).map((n) => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </label>
                                    <label className="inline-flex items-center gap-1.5 text-[12px] font-bold" title={t('systemOfHint')}>
                                        <span className="whitespace-nowrap">{t('systemOf')}</span>
                                        <select value={system} onChange={(e) => setSystem(e.target.value === 'auto' ? 'auto' : Number(e.target.value))} className="bb-input h-8 px-2 text-[12px] font-bold">
                                            <option value="auto">{t('systemAuto')}</option>
                                            {Array.from({length: Math.max(1, size - 1)}, (_, i) => i + 1).map((k) => <option key={k} value={k}>{k}</option>)}
                                        </select>
                                        <span className="text-muted-foreground">{system === 'auto' ? t('systemAutoNote') : t('systemOfFree', {k: system, n: typeof bankers === 'number' ? Math.max(2, size - bankers) : size})}</span>
                                    </label>
                                </>
                            )}
                        </div>
                    </div>
                    <div data-tour="schedina-days" className="flex flex-col gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('days')}</span>
                        <div className="flex flex-wrap gap-1">
                            <button type="button" onClick={() => setPickedDays([])} className={chip(pickedDays.length === 0)}>{t('anyDay')}</button>
                            {days.map((d) => <button key={d.day} type="button" onClick={() => setPickedDays((list) => toggle(list, d.day))} className={chip(pickedDays.includes(d.day))}>{d.label}</button>)}
                        </div>
                    </div>
                    <div data-tour="schedina-competitions" className="flex flex-col gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('competitions')}</span>
                        <div className="flex flex-wrap gap-1">
                            <button type="button" onClick={() => setPickedLeagues([])} className={chip(pickedLeagues.length === 0)}>{t('anyCompetition')}</button>
                            {competitions.map((c) => <button key={c.id} type="button" onClick={() => setPickedLeagues((list) => toggle(list, c.id))} className={chip(pickedLeagues.includes(c.id))}>{c.name}</button>)}
                        </div>
                    </div>
                    <div data-tour="schedina-generate" className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={generate} className="bb-btn bg-accent h-9 px-4 text-[13px] font-extrabold">{t('generate')}</button>
                        <span className="text-[11px] font-semibold text-muted-foreground">{t('available', {count: available})}</span>
                    </div>

                    {result === null && <p className="bb-surface px-3 py-2 text-[12px] font-semibold text-muted-foreground">{t('none')}</p>}
                    {result && (
                        <div className="bb-surface flex flex-col">
                            <div className="px-3 h-8 flex items-center justify-between gap-2 border-b-2 border-foreground bg-card text-[11px] font-extrabold uppercase tracking-wide">
                                <span>{t(`kinds.${result.kind}`)}{result.system ? ` ${result.system.of}/${result.system.free}${result.system.bankers > 0 ? ` + ${t('bankersCount', {count: result.system.bankers})}` : ''}` : ''} · {t(`risks.${result.risk}`)}</span>
                                <span className="font-mono normal-case tracking-normal text-muted-foreground">{t('selections', {count: result.selections.length})}</span>
                            </div>
                            <ul data-tour="schedina-result" className="flex flex-col divide-y divide-muted">
                                {result.selections.map((s) => (
                                    <li key={s.fixtureId} className="px-3 py-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                                        <span className="flex flex-col leading-tight font-mono text-[11px] font-bold tabular-nums w-14">
                                            <span>{format.dateTime(new Date(s.startingAt), {hour: '2-digit', minute: '2-digit'})}</span>
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">{format.dateTime(new Date(s.startingAt), {weekday: 'short', day: 'numeric'})}</span>
                                        </span>
                                        <span className="min-w-0 flex flex-col leading-tight">
                                            <Link href={`/matches/${s.fixtureId}`} target="_blank" rel="noopener noreferrer" className="font-extrabold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{s.home} – {s.away}</Link>
                                            <span className="text-[11px] font-semibold text-muted-foreground truncate">{s.banker && <span className="inline-flex items-center h-4 px-1 mr-1 rounded border border-foreground bg-accent text-[9px] font-extrabold uppercase tracking-wide text-foreground">{t('banker')}</span>}{s.competition} · {tm(`advice.tiers.${s.tier}`)}</span>
                                        </span>
                                        <span className="text-right leading-tight">
                                            <span className="block font-extrabold">{s.slip.legs.map((l) => legLabel(l.key)).join(' + ')}</span>
                                            <span className="block font-mono text-[11px] font-bold tabular-nums text-muted-foreground">{s.slip.pct}%{s.slip.odds !== null && ` · ${tm('book')} ${s.slip.odds.toFixed(2)}`}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <div data-tour="schedina-summary" className="grid grid-cols-2 sm:grid-cols-4 border-t-2 border-foreground">
                                {[
                                    [t('chance'), `${result.pct}%`],
                                    [tm('fair'), result.fair.toFixed(2)],
                                    [tm('book'), result.book === null ? '–' : `${result.selections.length > 1 ? '≈' : ''}${result.book.toFixed(2)}`],
                                    [t('settles'), settles ? format.dateTime(settles, {weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '–'],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex flex-col items-center justify-center px-2 py-1.5 border-t border-muted">
                                        <span className="font-mono text-base font-extrabold tabular-nums">{value}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground text-center leading-tight">{label}</span>
                                    </div>
                                ))}
                            </div>
                            {result.system && <p className="px-3 py-1.5 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{result.system.bankers > 0 ? t('systemNoteBankers', {bankers: result.system.bankers, columns: result.system.columns, of: result.system.of, n: result.system.free, pct: result.system.atLeastPct}) : t('systemNote', {columns: result.system.columns, of: result.system.of, n: result.system.free, pct: result.system.atLeastPct})}</p>}
                            {(() => {
                                const groups = systemGroups(result.selections);
                                const stakes = lineStakes ?? suggestedStakes(groups, stake, stakeMode);
                                const plan = stakePlan(result.selections, groups, stakes);
                                const bankers = result.selections.filter((x) => x.banker).length;
                                return (
                                    <div data-tour="schedina-stake" className="border-t-2 border-foreground">
                                        <div className="px-3 py-2 flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('stake')}</span>
                                            <label className="inline-flex items-center gap-1 text-[12px] font-bold">
                                                <input type="number" min={1} step={1} value={stake} onChange={(e) => { setStake(Math.max(0, Number(e.target.value) || 0)); setLineStakes(null); }} className="bb-input h-8 w-24 px-2 font-mono text-[13px] font-extrabold text-right" aria-label={t('stake')} />
                                                <span>€</span>
                                            </label>
                                            <div className="flex gap-1">
                                                {(['recommended', 'full'] as const).map((m) => <button key={m} type="button" onClick={() => { setStakeMode(m); setLineStakes(null); }} className={chip(stakeMode === m && lineStakes === null)} title={t(`stakeModeHint.${m}`)}>{t(`stakeModes.${m}`)}</button>)}
                                            </div>
                                        </div>
                                        <table className="w-full text-[12px]">
                                            <thead>
                                                <tr className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground border-t border-muted">
                                                    <th className="px-3 py-1 text-left">{t('line')}</th>
                                                    <th className="px-2 py-1 text-right">{t('chance')}</th>
                                                    <th className="px-2 py-1 text-right">{t('perColumn')}</th>
                                                    <th className="px-2 py-1 text-right">{t('lineTotal')}</th>
                                                    <th className="px-3 py-1 text-right">{t('payout')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {plan.lines.map((l, i) => (
                                                    <tr key={l.k} className={cn("border-t border-muted font-mono tabular-nums", l.stake === 0 && "text-muted-foreground")}>
                                                        <td className="px-3 py-1 font-sans">
                                                            <span className="font-extrabold text-[13px]">{t('kOfN', {k: l.k, n: l.n})}</span>
                                                            <span className="ml-1.5 text-muted-foreground">×{l.columns.length}</span>
                                                            {bankers > 0 && <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">{t('withBankers', {count: bankers})}</span>}
                                                        </td>
                                                        <td className="px-2 py-1 text-right">{l.atLeastPct}%</td>
                                                        <td className="px-2 py-1 text-right">
                                                            <input type="number" min={0} step={STAKE_STEP} value={l.stake} onChange={(e) => { const next = stakes.map((v, j) => (j === i ? toStakeStep(Number(e.target.value) || 0) : v)); setLineStakes(next); }} className="bb-input h-7 w-20 px-1.5 font-mono text-[12px] font-extrabold text-right" aria-label={`${t('kOfN', {k: l.k, n: l.n})} ${t('perColumn')}`} />
                                                        </td>
                                                        <td className="px-2 py-1 text-right">{l.lineStake.toFixed(2)}</td>
                                                        <td className="px-3 py-1 text-right">{l.priced ? '' : '≈'}{l.linePayout.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="grid grid-cols-2 sm:grid-cols-5 border-t border-muted">
                                            {[
                                                [t('totalStake'), `${plan.total.toFixed(2)} €`],
                                                [t('maxPayout'), `${plan.maxPayout.toFixed(2)} €`],
                                                [t('expectedReturn'), `${plan.expectedReturn.toFixed(2)} €`],
                                                [t('expectedProfit'), `${plan.expectedProfit >= 0 ? '+' : ''}${plan.expectedProfit.toFixed(2)} €`],
                                                [t('profitChance'), `${plan.profitChance}%`],
                                            ].map(([label, value]) => (
                                                <div key={label} className="flex flex-col items-center justify-center px-2 py-1.5 border-t border-muted">
                                                    <span className={cn("font-mono text-base font-extrabold tabular-nums", label === t('expectedProfit') && (plan.expectedProfit >= 0 ? "text-emerald-800" : "text-red-700"))}>{value}</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground text-center leading-tight">{label}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="px-3 py-1.5 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{plan.priced ? t('stakeNote') : t('stakeNoteFair')}</p>
                                    </div>
                                );
                            })()}
                            <div data-tour="schedina-save" className="px-3 py-2 border-t border-muted flex items-center gap-2 flex-wrap">
                                <button type="button" onClick={persist} disabled={signedIn === false || save === 'saving' || save === 'saved'} className={cn("bb-btn h-8 px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50", save === 'saved' ? "bg-card" : "bg-accent")}>
                                    {save === 'saved' ? <><Check className="w-3.5 h-3.5" aria-hidden="true" />{t('saved')}</> : save === 'saving' ? t('saving') : t('save')}
                                </button>
                                {signedIn === false && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700"><CloudOff className="w-3.5 h-3.5" aria-hidden="true" />{t('signIn')}</span>}
                                {save === 'error' && signedIn !== false && <span className="text-[11px] font-semibold text-red-700">{t('saveError')}</span>}
                                {save === 'saved' && <Link href="/predictions/record" className="text-[11px] font-extrabold hover:underline decoration-accent decoration-[2px] underline-offset-2">{t('toRecord')}</Link>}
                            </div>
                        </div>
                    )}
                    <p className="text-[11px] font-semibold text-muted-foreground leading-snug">{t('disclaimer')}</p>
                </div>
            </div>
        </div>
    );
}
