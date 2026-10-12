import {Help} from "@/components/fantasy/help";
import {useLocale, useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {Link} from "@/i18n/navigation";
import type {MatchMarketData} from "@/lib/football/data/markets";
import {bandHeat, BANDS, bestOf, calibrate, fairOdds, legChances, legLine, legText, MARKET_FAMILIES, suggestBets, type BetSuggestion, type LegKey, type OddsLine, type OddsSummary, type TeamMarketProfile} from "@/lib/football/markets";
import type {MatchPrediction} from "@/lib/football/prediction";
import type {TeamSummary} from "@/lib/football/types";
import {FactorLine, OutcomeBar} from "./prediction";

const fmtOdds = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toFixed(2));

/**
 * One family of markets: its cells side by side, the family's pick lit
 * (the cell the bookmakers pay above its fair price, else the likeliest);
 * under each chance the fair odds and, when stored, the bookmakers'
 * average, green when they pay more than the fair price.
 */
function MarketGroup({title, hint, cells, best}: {title: string; hint?: string; cells: Array<{key: LegKey; label: string; pct: number; odds?: OddsLine}>; best: LegKey | null}) {
    const t = useTranslations('Football.markets');
    return (
        <div className="flex flex-col gap-1 min-w-0">
            <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {title}
                {hint && <Help text={hint} />}
            </span>
            <div className="grid gap-1" style={{gridTemplateColumns: `repeat(${cells.length === 6 ? 3 : Math.min(cells.length, 5)}, minmax(0, 1fr))`}}>
                {cells.map((c) => {
                    const fair = fairOdds(c.pct);
                    const value = !!c.odds && fair !== null && c.odds.avg > fair;
                    return (
                        <div key={c.key} className={cn("relative flex flex-col items-center justify-center rounded border-2 border-foreground px-1 py-1.5", c.key === best ? "bg-accent" : "bg-card")} title={c.odds ? t('oddsHint', {pct: c.pct, fair: fmtOdds(fair), avg: fmtOdds(c.odds.avg), best: fmtOdds(c.odds.best), book: c.odds.bestBook, books: c.odds.books}) : t('fairHint', {pct: c.pct, odds: fmtOdds(fair)})}>
                            {c.key === best && <span className="absolute -top-2 right-1 px-1 rounded border border-foreground bg-foreground text-background text-[8px] font-black uppercase tracking-wide leading-tight">{t('best')}</span>}
                            <span className="text-[11px] font-extrabold leading-none text-center">{c.label}</span>
                            <span className="font-mono text-base font-extrabold tabular-nums leading-tight">{c.pct}%</span>
                            <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground leading-none">{t('fair')} {fmtOdds(fair)}</span>
                            {c.odds && <span className={cn("font-mono text-[10px] font-extrabold tabular-nums leading-none mt-0.5", value ? "text-emerald-800" : "text-foreground")}>{t('book')} {fmtOdds(c.odds.avg)}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Goals scored and conceded per quarter hour, one column per side, bars
 * on a shared scale. The rows are tinted by `heat`: the share of the
 * match's goals (both sides, scored and conceded) that falls in the
 * band, so the quarter hours where the match should move stand out.
 */
function GoalBands({profile, team, scale, heat}: {profile: TeamMarketProfile | null; team: TeamSummary; scale: number; heat: number[] | null}) {
    const t = useTranslations('Football.markets');
    const peakHeat = heat ? Math.max(...heat) : 0;
    // Only the quarter hours above an even share (a sixth each) are tinted, from faint just above it to full at the peak: a card of six near-equal bands stays white.
    const evenShare = 100 / BANDS.length;
    const tintOf = (share: number) => (peakHeat > evenShare + 1.5 && share > evenShare + 1.5 ? Math.round((0.12 + 0.33 * ((share - evenShare) / (peakHeat - evenShare))) * 100) / 100 : 0);
    return (
        <div className="min-w-0">
            <div className="px-3 h-7 flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase tracking-wide border-b border-muted bg-muted/40">
                <span className="truncate">{team.name}</span>
                {profile && <span className="font-mono text-[10px] text-muted-foreground normal-case tracking-normal whitespace-nowrap">{t('bandsBase', {count: profile.bands.matches})}</span>}
            </div>
            {!profile || profile.bands.matches === 0 ? (
                <p className="px-3 py-2 text-[12px] font-semibold text-muted-foreground">{t('noEvents')}</p>
            ) : (
                <table className="w-full text-[12px]">
                    <tbody>
                        {BANDS.map((band, i) => {
                            const f = profile.bands.for[i];
                            const a = profile.bands.against[i];
                            const peakFor = f > 0 && f === Math.max(...profile.bands.for);
                            const share = heat?.[i] ?? 0;
                            const alpha = tintOf(share);
                            return (
                                <tr key={band} className="border-b border-muted last:border-b-0" style={alpha > 0 ? {backgroundColor: `rgb(var(--accent) / ${alpha})`} : undefined} title={heat ? t('heatHint', {pct: share}) : undefined}>
                                    <td className="pl-3 pr-2 py-1 font-mono font-bold tabular-nums text-muted-foreground whitespace-nowrap w-14 leading-tight">{band}&apos;{heat && <span className={cn("block text-[10px]", share === peakHeat && "text-foreground font-extrabold")}>{share}%</span>}</td>
                                    <td className="py-1 pr-2">
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-2.5 rounded-sm bg-accent border border-foreground/60" style={{width: `${Math.max(2, (f / scale) * 100)}%`}} aria-hidden="true" />
                                            <span className={cn("font-mono font-extrabold tabular-nums", peakFor && "underline decoration-accent decoration-[2px] underline-offset-2")}>{f}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <div className="h-2.5 rounded-sm bg-foreground" style={{width: `${Math.max(2, (a / scale) * 100)}%`}} aria-hidden="true" />
                                            <span className="font-mono font-bold tabular-nums text-muted-foreground">{a}</span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
            {profile && profile.bands.matches > 0 && (
                <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground border-t border-muted leading-snug">
                    {t('firstHalfGoal', {pct: profile.firstHalfGoalPct})} · {t('scoredFirst', {pct: profile.scoredFirstPct, won: profile.wonWhenFirstPct})}
                </p>
            )}
        </div>
    );
}

/**
 * The markets tab of a match: the prediction (outcome bar, expected
 * goals, the reasons) and what the model gives every market, family by
 * family (result and handicaps, goals and ranges, who scores, first
 * half, odd/even, corners, cards, exact scores), each with the odds
 * that would pay it fairly, the bookmakers' own beside and the
 * family's pick lit; then the three slips the model would play; when
 * the two sides score and concede; how their matches go over the goal
 * lines; corners and cards. A reading of the numbers, not advice on
 * what to play.
 */
export function MatchMarkets({data, prediction, odds, home, away, title}: {data: MatchMarketData | null; prediction: MatchPrediction | null; odds: OddsSummary | null; home: TeamSummary; away: TeamSummary; title: string}) {
    const t = useTranslations('Football.markets');
    const locale = useLocale();
    const tp = useTranslations('Football.prediction');
    // Every leg's chance, calibrated like the slips' below: the same number wherever a selection shows.
    const chances = prediction ? new Map([...legChances(prediction)].map(([k, v]) => [k, calibrate(v, prediction.calibration)])) : null;
    // Every family with a chance to show, its cells and its pick; corners and cards drop out without the sides' statistics.
    const families = chances
        ? MARKET_FAMILIES.map((f) => ({id: f.id, best: bestOf(f.keys, chances, odds), cells: f.keys.filter((k) => chances.has(k)).map((k) => ({key: k, label: legText(k, locale), pct: Math.round(chances.get(k)!), odds: legLine(odds, k)}))})).filter((f) => f.cells.length > 0)
        : [];
    const familyHint = (id: string): string | undefined => {
        if (id === 'corners') return prediction?.counts.corners !== null && prediction?.counts.corners !== undefined ? t('familyHints.corners', {value: prediction.counts.corners.toFixed(1)}) : undefined;
        if (id === 'cards') return prediction?.counts.yellows !== null && prediction?.counts.yellows !== undefined ? t('familyHints.cards', {value: prediction.counts.yellows.toFixed(1)}) : undefined;
        return ['handicap', 'handicapPlus', 'multigol', 'half'].includes(id) ? t(`familyHints.${id}`) : undefined;
    };
    const slips: BetSuggestion[] = prediction ? suggestBets(prediction, odds) : [];
    const legLabel = (key: LegKey) => legText(key, locale);
    const h = data?.home ?? null;
    const a = data?.away ?? null;
    const scale = Math.max(1, ...[h, a].flatMap((p) => (p ? [...p.bands.for, ...p.bands.against] : [])));
    const heat = bandHeat(h, a);
    const cell = (p: TeamMarketProfile | null, pick: (p: TeamMarketProfile) => string) => (p ? pick(p) : '–');
    const pctOf = (v: number) => `${v}%`;
    const rows: Array<{label: string; home: string; away: string; strong?: (p: TeamMarketProfile) => boolean}> = [
        {label: t('rows.over05'), home: cell(h, (p) => pctOf(p.over05Pct)), away: cell(a, (p) => pctOf(p.over05Pct))},
        {label: t('rows.over15'), home: cell(h, (p) => pctOf(p.over15Pct)), away: cell(a, (p) => pctOf(p.over15Pct)), strong: (p) => p.over15Pct >= 70},
        {label: t('rows.over25'), home: cell(h, (p) => pctOf(p.over25Pct)), away: cell(a, (p) => pctOf(p.over25Pct)), strong: (p) => p.over25Pct >= 60},
        {label: t('rows.over35'), home: cell(h, (p) => pctOf(p.over35Pct)), away: cell(a, (p) => pctOf(p.over35Pct)), strong: (p) => p.over35Pct >= 50},
        {label: t('rows.under25'), home: cell(h, (p) => pctOf(100 - p.over25Pct)), away: cell(a, (p) => pctOf(100 - p.over25Pct)), strong: (p) => 100 - p.over25Pct >= 60},
        {label: t('rows.btts'), home: cell(h, (p) => pctOf(p.bttsPct)), away: cell(a, (p) => pctOf(p.bttsPct)), strong: (p) => p.bttsPct >= 60},
        {label: t('rows.cleanSheet'), home: cell(h, (p) => pctOf(p.cleanSheetPct)), away: cell(a, (p) => pctOf(p.cleanSheetPct)), strong: (p) => p.cleanSheetPct >= 50},
        {label: t('rows.failedToScore'), home: cell(h, (p) => pctOf(p.failedToScorePct)), away: cell(a, (p) => pctOf(p.failedToScorePct)), strong: (p) => p.failedToScorePct >= 40},
        {label: t('rows.goalsFor'), home: cell(h, (p) => p.goalsForAvg.toFixed(2)), away: cell(a, (p) => p.goalsForAvg.toFixed(2))},
        {label: t('rows.goalsAgainst'), home: cell(h, (p) => p.goalsAgainstAvg.toFixed(2)), away: cell(a, (p) => p.goalsAgainstAvg.toFixed(2))},
        {label: t('rows.goalsTotal'), home: cell(h, (p) => p.goalsAvg.toFixed(2)), away: cell(a, (p) => p.goalsAvg.toFixed(2))},
        {label: t('rows.venue'), home: cell(h, (p) => (p.venue.played > 0 ? t('venueLine', {played: p.venue.played, gf: p.venue.goalsFor, ga: p.venue.goalsAgainst, over: p.venue.over25Pct, btts: p.venue.bttsPct}) : '–')), away: cell(a, (p) => (p.venue.played > 0 ? t('venueLine', {played: p.venue.played, gf: p.venue.goalsFor, ga: p.venue.goalsAgainst, over: p.venue.over25Pct, btts: p.venue.bttsPct}) : '–'))},
    ];
    const setPieces: Array<{label: string; home: string; away: string}> = [
        {label: t('rows.cornersFor'), home: cell(h, (p) => (p.cornersFor === null ? '–' : p.cornersFor.toFixed(1))), away: cell(a, (p) => (p.cornersFor === null ? '–' : p.cornersFor.toFixed(1)))},
        {label: t('rows.cornersAgainst'), home: cell(h, (p) => (p.cornersAgainst === null ? '–' : p.cornersAgainst.toFixed(1))), away: cell(a, (p) => (p.cornersAgainst === null ? '–' : p.cornersAgainst.toFixed(1)))},
        {label: t('rows.yellowFor'), home: cell(h, (p) => (p.yellowFor === null ? '–' : p.yellowFor.toFixed(1))), away: cell(a, (p) => (p.yellowFor === null ? '–' : p.yellowFor.toFixed(1)))},
        {label: t('rows.yellowAgainst'), home: cell(h, (p) => (p.yellowAgainst === null ? '–' : p.yellowAgainst.toFixed(1))), away: cell(a, (p) => (p.yellowAgainst === null ? '–' : p.yellowAgainst.toFixed(1)))},
    ];
    const table = (list: Array<{label: string; home: string; away: string; strong?: (p: TeamMarketProfile) => boolean}>) => (
        <table className="w-full text-[13px]">
            <tbody>
                {list.map((r) => (
                    <tr key={r.label} className="border-b border-muted last:border-b-0">
                        <td className={cn("px-3 py-1.5 w-1/3 text-right font-mono font-extrabold tabular-nums", h && r.strong?.(h) && "text-emerald-800")}>{r.home}</td>
                        <td className="px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground leading-tight">{r.label}</td>
                        <td className={cn("px-3 py-1.5 w-1/3 text-left font-mono font-extrabold tabular-nums", a && r.strong?.(a) && "text-emerald-800")}>{r.away}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
    const help = (text: string) => <Help boxed text={text} />;
    const base = data ? t('base', {home: h?.played ?? 0, away: a?.played ?? 0, seasons: data.seasons.map((y) => `${y}/${String(y + 1).slice(-2)}`).join(', ')}) : '';
    const heads = (
        <div className="grid grid-cols-[1fr_auto_1fr] px-3 h-7 items-center text-[11px] font-extrabold uppercase tracking-wide border-b border-muted bg-muted/40">
            <span className="truncate text-right">{home.name}</span>
            <span className="w-8" />
            <span className="truncate">{away.name}</span>
        </div>
    );

    const updated = odds?.updatedAt ? new Date(odds.updatedAt) : null;
    const expectedCorners = prediction?.counts.corners ?? data?.expected.corners ?? null;
    const expectedYellows = prediction?.counts.yellows ?? data?.expected.yellows ?? null;
    return (
        <div className="flex flex-col gap-3">
            <div data-tour="analysis"><Panel title={title} action={<span className="flex items-center gap-2">{prediction && <span className="text-[11px] font-bold text-muted-foreground">{tp(`confidence.${prediction.confidence}`)}</span>}{help(t('hint'))}</span>}>
                <p className="px-3 py-2 text-[12px] font-semibold leading-snug border-b border-muted">{t('intro')}</p>
                {prediction && chances ? (
                    <>
                        <div className="px-3 pt-2.5 pb-2">
                            <div className="flex justify-between text-[11px] font-extrabold mb-1">
                                <span className="truncate">{home.name}</span>
                                <span className="truncate text-right">{away.name}</span>
                            </div>
                            <OutcomeBar prediction={prediction} />
                            <div className="mt-1.5 text-[11px] font-semibold text-muted-foreground text-center">
                                {tp('pick')}: <span className="font-mono font-extrabold text-foreground bg-accent px-1 rounded">{prediction.pick}</span> · {tp('expectedGoals')} <span className="font-mono font-extrabold text-foreground">{prediction.lambda.home.toFixed(2)}</span> – <span className="font-mono font-extrabold text-foreground">{prediction.lambda.away.toFixed(2)}</span> · {tp('sample', {count: prediction.sample})}
                            </div>
                        </div>
                        <div className="px-3 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 border-t border-muted">
                            <p className="sm:col-span-2 -mb-1 text-[11px] font-semibold text-muted-foreground leading-snug flex items-center gap-1">{t('modelHint')}{help(t('bestHint'))}</p>
                            {families.map((f) => <MarketGroup key={f.id} title={t(`groups.${f.id}`)} hint={familyHint(f.id)} cells={f.cells} best={f.best} />)}
                            {prediction.counts.corners === null && <p className="sm:col-span-2 text-[11px] font-semibold text-muted-foreground leading-snug">{t('noCounts')}</p>}
                            <div className="flex flex-col gap-1 min-w-0 sm:col-span-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('groups.scores')}</span>
                                <ul className="flex flex-wrap gap-1">
                                    {prediction.scores.slice(0, 5).map((sc, i) => {
                                        const book = odds?.scores?.[`${sc.home}-${sc.away}`];
                                        const fair = fairOdds(sc.pct);
                                        return (
                                            <li key={`${sc.home}-${sc.away}`} className={cn("inline-flex items-center gap-1.5 px-2 h-9 rounded border-2 border-foreground font-mono text-[12px] font-extrabold tabular-nums", i === 0 ? "bg-accent" : "bg-card")} title={book ? t('oddsHint', {pct: sc.pct, fair: fmtOdds(fair), avg: fmtOdds(book.avg), best: fmtOdds(book.best), book: book.bestBook, books: book.books}) : t('fairHint', {pct: sc.pct, odds: fmtOdds(fair)})}>
                                                {sc.home}-{sc.away}
                                                <span className="flex flex-col leading-none text-[10px] text-muted-foreground">
                                                    <span>{sc.pct.toFixed(1)}%</span>
                                                    <span>{t('fair')} {fmtOdds(fair)}{book && <span className={cn("ml-1", fair !== null && book.avg > fair ? "text-emerald-800" : "text-foreground")}>{t('book')} {fmtOdds(book.avg)}</span>}</span>
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>
                        {slips.length > 0 && (
                            <div data-tour="advice" className="border-t border-muted px-3 py-2.5">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('advice.title')}</span>
                                    {help(t('advice.hint'))}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {slips.map((s) => (
                                        <div key={s.tier} className={cn("rounded border-2 border-foreground px-2.5 py-2 flex flex-col gap-1", s.tier === 'balanced' ? "bg-accent" : "bg-card")} title={s.legs.map((l) => `${legLabel(l.key)} ${l.pct}%`).join(' · ')}>
                                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t(`advice.tiers.${s.tier}`)}</span>
                                            <span className="text-[13px] font-extrabold leading-tight">{s.legs.map((l) => legLabel(l.key)).join(' + ')}</span>
                                            <span className="font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
                                                <span className="text-foreground">{s.pct}%</span> · {t('fair')} {s.fair.toFixed(2)}{s.odds !== null && <> · {t('book')} {s.legs.length > 1 ? '≈' : ''}{s.odds.toFixed(2)}</>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground leading-snug">{t('advice.note')} <Link href="/predictions/record" className="font-extrabold text-foreground hover:underline decoration-accent decoration-[2px] underline-offset-2">{t('advice.record')}</Link></p>
                            </div>
                        )}
                        <p className="px-3 py-1.5 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">
                            {t('legendFair')}{odds ? ` · ${t('legendBook', {books: odds.books, at: updated ? updated.toLocaleString(locale, {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'}) : '–'})}` : ` · ${t('noOdds')}`}
                        </p>
                        {prediction.factors.length > 0 && (
                            <div className="border-t border-muted px-3 py-2">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{tp('why')}</span>
                                <ul className="mt-1 flex flex-col gap-1 text-[12px] font-semibold leading-snug list-disc pl-4">
                                    {prediction.factors.map((f) => <FactorLine key={f.key} factor={f} home={home} away={away} />)}
                                </ul>
                            </div>
                        )}
                    </>
                ) : (
                    <p className="px-3 py-2 text-[12px] font-semibold text-muted-foreground">{tp('empty')}</p>
                )}
                <p className="px-3 py-2 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{t('disclaimer')}</p>
            </Panel></div>

            {!data ? (
                <Panel title={t('bandsTitle')}><p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('empty')}</p></Panel>
            ) : (
                <>
                    <div data-tour="bands"><Panel title={t('bandsTitle')} action={help(t('bandsHint'))}>
                        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-muted">
                            <GoalBands profile={h} team={home} scale={scale} heat={heat} />
                            <GoalBands profile={a} team={away} scale={scale} heat={heat} />
                        </div>
                        <p className="px-3 py-1.5 border-t border-muted text-[11px] font-semibold text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-accent border border-foreground/60" aria-hidden="true" />{t('legend.for')}</span>
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-foreground" aria-hidden="true" />{t('legend.against')}</span>
                            <span>{t('legend.peak')}</span>
                            {heat && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm border border-foreground/40" style={{backgroundColor: 'rgb(var(--accent) / 0.45)'}} aria-hidden="true" />{t('legend.heat')}</span>}
                        </p>
                    </Panel></div>
                    <div data-tour="lines"><Panel title={t('linesTitle')} action={help(t('linesHint'))}>
                        {heads}
                        {table(rows)}
                        <p className="px-3 py-1.5 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{base}</p>
                    </Panel></div>
                    <div data-tour="setpieces"><Panel title={t('setPiecesTitle')} action={help(t('setPiecesHint'))}>
                        {heads}
                        {table(setPieces)}
                        {(expectedCorners !== null || expectedYellows !== null) && (
                            <p className="px-3 py-1.5 border-t border-muted text-[12px] font-semibold leading-snug">
                                {expectedCorners !== null && <span>{t('expectedCorners', {value: expectedCorners.toFixed(1)})}</span>}
                                {expectedCorners !== null && expectedYellows !== null && ' · '}
                                {expectedYellows !== null && <span>{t('expectedYellows', {value: expectedYellows.toFixed(1)})}</span>}
                            </p>
                        )}
                    </Panel></div>
                </>
            )}
        </div>
    );
}
