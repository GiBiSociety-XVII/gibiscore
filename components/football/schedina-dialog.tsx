'use client';

import {useEffect, useMemo, useState} from "react";
import {X, Check, CloudOff} from "lucide-react";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {cloudUser} from "@/lib/fantasy/cloud";
import type {LegKey} from "@/lib/football/markets";
import {buildSchedina, type Schedina, type SchedinaCandidate, type SchedinaKind, type SchedinaRisk} from "@/lib/football/schedina";

const RISKS: SchedinaRisk[] = ['low', 'medium', 'high'];
const KINDS: SchedinaKind[] = ['single', 'multiple', 'system'];

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
    const [system, setSystem] = useState(2);
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
        setResult(buildSchedina(candidates, {risk, kind, size, system, days: pickedDays, competitions: pickedLeagues, now: new Date().toISOString()}));
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
                    <button type="button" onClick={onClose} aria-label={t('close')} className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-md border-2 border-foreground bg-background hover:bg-muted"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-3 py-3 flex flex-col gap-3 text-[13px]">
                    <p className="text-[12px] font-semibold text-muted-foreground leading-snug">{t('intro')}</p>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('risk')}</span>
                        <div className="flex flex-wrap gap-1">{RISKS.map((r) => <button key={r} type="button" onClick={() => setRisk(r)} className={chip(risk === r)} title={t(`riskHint.${r}`)}>{t(`risks.${r}`)}</button>)}</div>
                    </div>
                    <div className="flex flex-col gap-1">
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
                                <label className="inline-flex items-center gap-1.5 text-[12px] font-bold">
                                    {t('systemOf')}
                                    <input type="number" min={1} max={Math.max(1, size - 1)} value={Math.min(system, Math.max(1, size - 1))} onChange={(e) => setSystem(Math.max(1, Math.min(size - 1, Number(e.target.value) || 1)))} className="bb-input h-8 w-16 px-2 font-mono text-[13px] font-extrabold text-center" />
                                    <span className="text-muted-foreground">{t('systemOfN', {n: size})}</span>
                                </label>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('days')}</span>
                        <div className="flex flex-wrap gap-1">
                            <button type="button" onClick={() => setPickedDays([])} className={chip(pickedDays.length === 0)}>{t('anyDay')}</button>
                            {days.map((d) => <button key={d.day} type="button" onClick={() => setPickedDays((list) => toggle(list, d.day))} className={chip(pickedDays.includes(d.day))}>{d.label}</button>)}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('competitions')}</span>
                        <div className="flex flex-wrap gap-1">
                            <button type="button" onClick={() => setPickedLeagues([])} className={chip(pickedLeagues.length === 0)}>{t('anyCompetition')}</button>
                            {competitions.map((c) => <button key={c.id} type="button" onClick={() => setPickedLeagues((list) => toggle(list, c.id))} className={chip(pickedLeagues.includes(c.id))}>{c.name}</button>)}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={generate} className="bb-btn bg-accent h-9 px-4 text-[13px] font-extrabold">{t('generate')}</button>
                        <span className="text-[11px] font-semibold text-muted-foreground">{t('available', {count: available})}</span>
                    </div>

                    {result === null && <p className="bb-surface px-3 py-2 text-[12px] font-semibold text-muted-foreground">{t('none')}</p>}
                    {result && (
                        <div className="bb-surface flex flex-col">
                            <div className="px-3 h-8 flex items-center justify-between gap-2 border-b-2 border-foreground bg-card text-[11px] font-extrabold uppercase tracking-wide">
                                <span>{t(`kinds.${result.kind}`)}{result.system ? ` ${result.system.of}/${result.selections.length}` : ''} · {t(`risks.${result.risk}`)}</span>
                                <span className="font-mono normal-case tracking-normal text-muted-foreground">{t('selections', {count: result.selections.length})}</span>
                            </div>
                            <ul className="flex flex-col divide-y divide-muted">
                                {result.selections.map((s) => (
                                    <li key={s.fixtureId} className="px-3 py-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                                        <span className="flex flex-col leading-tight font-mono text-[11px] font-bold tabular-nums w-14">
                                            <span>{format.dateTime(new Date(s.startingAt), {hour: '2-digit', minute: '2-digit'})}</span>
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">{format.dateTime(new Date(s.startingAt), {weekday: 'short', day: 'numeric'})}</span>
                                        </span>
                                        <span className="min-w-0 flex flex-col leading-tight">
                                            <Link href={`/matches/${s.fixtureId}`} target="_blank" rel="noopener noreferrer" className="font-extrabold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{s.home} – {s.away}</Link>
                                            <span className="text-[11px] font-semibold text-muted-foreground truncate">{s.competition} · {tm(`advice.tiers.${s.tier}`)}</span>
                                        </span>
                                        <span className="text-right leading-tight">
                                            <span className="block font-extrabold">{s.slip.legs.map((l) => legLabel(l.key)).join(' + ')}</span>
                                            <span className="block font-mono text-[11px] font-bold tabular-nums text-muted-foreground">{s.slip.pct}%{s.slip.odds !== null && ` · ${tm('book')} ${s.slip.odds.toFixed(2)}`}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <div className="grid grid-cols-2 sm:grid-cols-4 border-t-2 border-foreground">
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
                            {result.system && <p className="px-3 py-1.5 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{t('systemNote', {columns: result.system.columns, of: result.system.of, n: result.selections.length, pct: result.system.atLeastPct})}</p>}
                            <div className="px-3 py-2 border-t border-muted flex items-center gap-2 flex-wrap">
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
