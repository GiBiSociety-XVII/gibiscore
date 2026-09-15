import {getTranslations} from "next-intl/server";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/site-shell";
import {RoleBadge} from "@/components/fantasy/role-badge";
import type {FantaRole} from "@/lib/fantasy/scores";
import {DEFAULT_CALIBRATION, FIT_MIN_PAIRS, fitCalibration, toVoto, type VotoPair} from "@/lib/fantasy/voto";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
/** Rating bands of the provider's scale: where the site's estimate runs high or low. */
const BANDS: Array<[number, number]> = [[0, 6], [6, 6.5], [6.5, 7], [7, 7.5], [7.5, 8], [8, 11]];
const fmt = (v: number, d = 2) => v.toFixed(d);
const signed = (v: number, d = 2) => (v > 0 ? `+${v.toFixed(d)}` : v.toFixed(d));

interface Bucket {
    n: number;
    real: number;
    estimate: number;
    bias: number;
    mae: number;
    within: number;
}

function bucket(pairs: VotoPair[], estimate: (p: VotoPair) => number): Bucket | null {
    if (pairs.length === 0) return null;
    const n = pairs.length;
    const diffs = pairs.map((p) => p.voto - estimate(p));
    return {
        n,
        real: pairs.reduce((s, p) => s + p.voto, 0) / n,
        estimate: pairs.reduce((s, p) => s + estimate(p), 0) / n,
        bias: diffs.reduce((s, d) => s + d, 0) / n,
        mae: diffs.reduce((s, d) => s + Math.abs(d), 0) / n,
        within: diffs.filter((d) => Math.abs(d) <= 0.5).length / n,
    };
}

/** The typed votes against the site's estimate, by role and by rating band. */
export async function ModelView({pairs}: {pairs: VotoPair[]}) {
    const t = await getTranslations('Fantasy.model');
    const ts = await getTranslations('Fantasy.setup');
    const fitted = fitCalibration(pairs);
    const byDefault = (p: VotoPair) => toVoto(p.rating, p.role, DEFAULT_CALIBRATION);
    const byFitted = (p: VotoPair) => toVoto(p.rating, p.role, fitted);
    const all = bucket(pairs, byDefault);
    const allFitted = bucket(pairs, byFitted);
    const biasClass = (b: number) => (Math.abs(b) <= 0.1 ? "bg-emerald-200" : Math.abs(b) <= 0.25 ? "bg-amber-200" : "bg-red-200");
    const th = "px-2 py-1.5 text-right font-mono";
    const td = "px-2 py-1 text-right font-mono tabular-nums";

    return (
        <>
            {pairs.length === 0 ? (
                <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                <>
                    <section className="bb-surface overflow-hidden">
                        <div className="px-3 h-8 flex items-center text-[12px] font-extrabold uppercase tracking-wide border-b-2 border-foreground bg-card">{t('totals')}</div>
                        <div className="flex overflow-x-auto">
                            {[
                                {value: String(pairs.length), label: t('pairs')},
                                {value: fmt(all!.real), label: t('avgReal')},
                                {value: fmt(all!.estimate), label: t('avgEstimate')},
                                {value: signed(all!.bias), label: t('bias'), accent: true},
                                {value: fmt(all!.mae), label: t('mae')},
                                {value: `${Math.round(all!.within * 100)}%`, label: t('within')},
                                {value: fmt(allFitted!.mae), label: t('maeFitted')},
                            ].map((s) => (
                                <div key={s.label} className={cn("flex-1 flex flex-col gap-0.5 px-3 py-2 border-l border-muted first:border-l-0 min-w-[92px]", s.accent && "bg-accent/40")}>
                                    <span className="font-mono text-[20px] font-bold leading-none tabular-nums">{s.value}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{s.label}</span>
                                </div>
                            ))}
                        </div>
                        <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('totalsHint')}</p>
                    </section>

                    <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
                        <Panel title={t('byRole')}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                            <th className="px-2 py-1.5 text-left">{t('colRole')}</th>
                                            <th className={th}>{t('colPairs')}</th>
                                            <th className={th}>{t('colReal')}</th>
                                            <th className={th}>{t('colEstimate')}</th>
                                            <th className={th}>{t('colBias')}</th>
                                            <th className={th}>{t('colMae')}</th>
                                            <th className={th}>{t('colScale')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ROLES.map((role, i) => {
                                            const own = pairs.filter((p) => p.role === role);
                                            const b = bucket(own, byDefault);
                                            const line = fitted[role];
                                            const base = DEFAULT_CALIBRATION[role];
                                            return (
                                                <tr key={role} className={cn("border-b border-muted last:border-b-0", i % 2 === 1 && "bg-muted/30")}>
                                                    <td className="px-2 py-1"><span className="inline-flex items-center gap-1.5"><RoleBadge role={role} /><span className="font-bold">{ts(`roles.${role}`)}</span></span></td>
                                                    <td className={td}>{own.length}</td>
                                                    <td className={td}>{b ? fmt(b.real) : '–'}</td>
                                                    <td className={td}>{b ? fmt(b.estimate) : '–'}</td>
                                                    <td className={td}>{b ? <span className={cn("bb-badge h-5 px-1 text-[11px] font-bold", biasClass(b.bias))}>{signed(b.bias)}</span> : '–'}</td>
                                                    <td className={td}>{b ? fmt(b.mae) : '–'}</td>
                                                    <td className={cn(td, "text-[11px] text-muted-foreground whitespace-nowrap")}>{own.length >= FIT_MIN_PAIRS ? t('scaleFitted', {slope: fmt(line.slope), intercept: fmt(line.intercept)}) : own.length > 0 ? t('scaleShifted', {shift: signed(line.intercept - base.intercept)}) : t('scaleDefault')}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('byRoleHint', {min: FIT_MIN_PAIRS})}</p>
                        </Panel>

                        <Panel title={t('byBand')}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                            <th className="px-2 py-1.5 text-left">{t('colBand')}</th>
                                            <th className={th}>{t('colPairs')}</th>
                                            <th className={th}>{t('colReal')}</th>
                                            <th className={th}>{t('colEstimate')}</th>
                                            <th className={th}>{t('colBias')}</th>
                                            <th className={th}>{t('colWithin')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {BANDS.map(([from, to], i) => {
                                            const own = pairs.filter((p) => p.rating >= from && p.rating < to);
                                            const b = bucket(own, byDefault);
                                            return (
                                                <tr key={from} className={cn("border-b border-muted last:border-b-0", i % 2 === 1 && "bg-muted/30")}>
                                                    <td className="px-2 py-1 font-mono font-bold tabular-nums">{from === 0 ? `< ${to.toFixed(1)}` : to > 10 ? `≥ ${from.toFixed(1)}` : `${from.toFixed(1)} – ${to.toFixed(1)}`}</td>
                                                    <td className={td}>{own.length}</td>
                                                    <td className={td}>{b ? fmt(b.real) : '–'}</td>
                                                    <td className={td}>{b ? fmt(b.estimate) : '–'}</td>
                                                    <td className={td}>{b ? <span className={cn("bb-badge h-5 px-1 text-[11px] font-bold", biasClass(b.bias))}>{signed(b.bias)}</span> : '–'}</td>
                                                    <td className={td}>{b ? `${Math.round(b.within * 100)}%` : '–'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('byBandHint')}</p>
                        </Panel>
                    </div>
                    <Panel title={t('howTitle')}>
                        <ul className="px-3 py-2 flex flex-col gap-1.5 text-[12px] font-semibold text-muted-foreground list-disc pl-7">
                            <li>{t('how1')}</li>
                            <li>{t('how2')}</li>
                            <li>{t('how3')}</li>
                        </ul>
                    </Panel>
                </>
            )}
        </>
    );
}
