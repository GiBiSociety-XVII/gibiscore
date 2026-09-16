import {HelpCircle} from "lucide-react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {MatchMarketData} from "@/lib/football/data/markets";
import {BANDS, matchMarkets, type MarketLine, type TeamMarketProfile} from "@/lib/football/markets";
import type {MatchPrediction} from "@/lib/football/prediction";
import type {TeamSummary} from "@/lib/football/types";

const fmtOdds = (v: number | null) => (v === null ? '–' : v.toFixed(2));

/** One market: its cells side by side, the likeliest one lit, the fair odds under each chance. */
function MarketGroup({title, cells}: {title: string; cells: Array<{label: string; line: MarketLine}>}) {
    const t = useTranslations('Football.markets');
    const best = Math.max(...cells.map((c) => c.line.pct));
    return (
        <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{title}</span>
            <div className="grid gap-1" style={{gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`}}>
                {cells.map((c) => (
                    <div key={c.label} className={cn("flex flex-col items-center justify-center rounded border-2 border-foreground px-1 py-1.5", c.line.pct === best ? "bg-accent" : "bg-card")} title={t('fairHint', {pct: c.line.pct, odds: fmtOdds(c.line.fair)})}>
                        <span className="text-[11px] font-extrabold leading-none">{c.label}</span>
                        <span className="font-mono text-base font-extrabold tabular-nums leading-tight">{c.line.pct}%</span>
                        <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground leading-none">{t('fair')} {fmtOdds(c.line.fair)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Goals scored and conceded per quarter hour, one column per side, bars on a shared scale. */
function GoalBands({profile, team, scale}: {profile: TeamMarketProfile | null; team: TeamSummary; scale: number}) {
    const t = useTranslations('Football.markets');
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
                            return (
                                <tr key={band} className="border-b border-muted last:border-b-0">
                                    <td className="pl-3 pr-2 py-1 font-mono font-bold tabular-nums text-muted-foreground whitespace-nowrap w-12">{band}&apos;</td>
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
 * The markets tab of a match: what the model gives every market, with
 * the odds that would pay it fairly; when the two sides score and
 * concede; how their matches go over the goal lines; corners and cards.
 * A reading of the numbers, not advice on what to play.
 */
export function MatchMarkets({data, prediction, home, away, title}: {data: MatchMarketData | null; prediction: MatchPrediction | null; home: TeamSummary; away: TeamSummary; title: string}) {
    const t = useTranslations('Football.markets');
    const markets = prediction ? matchMarkets(prediction) : null;
    const h = data?.home ?? null;
    const a = data?.away ?? null;
    const scale = Math.max(1, ...[h, a].flatMap((p) => (p ? [...p.bands.for, ...p.bands.against] : [])));
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
    const help = (text: string) => <span title={text} className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-foreground/40 bg-card text-muted-foreground"><HelpCircle className="w-3.5 h-3.5" aria-hidden="true" /><span className="sr-only">{text}</span></span>;
    const base = data ? t('base', {home: h?.played ?? 0, away: a?.played ?? 0, seasons: data.seasons.map((y) => `${y}/${String(y + 1).slice(-2)}`).join(', ')}) : '';
    const heads = (
        <div className="grid grid-cols-[1fr_auto_1fr] px-3 h-7 items-center text-[11px] font-extrabold uppercase tracking-wide border-b border-muted bg-muted/40">
            <span className="truncate text-right">{home.name}</span>
            <span className="w-8" />
            <span className="truncate">{away.name}</span>
        </div>
    );

    return (
        <div className="flex flex-col gap-3">
            <Panel title={title} action={help(t('hint'))}>
                <p className="px-3 py-2 text-[12px] font-semibold leading-snug">{t('intro')}</p>
                <p className="px-3 pb-2 text-[11px] font-semibold text-muted-foreground leading-snug">{t('disclaimer')}</p>
            </Panel>

            {markets && (
                <Panel title={t('modelTitle')} action={help(t('modelHint'))}>
                    <div className="px-3 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        <MarketGroup title={t('groups.outcome')} cells={[{label: '1', line: markets.outcome.home}, {label: 'X', line: markets.outcome.draw}, {label: '2', line: markets.outcome.away}]} />
                        <MarketGroup title={t('groups.doubleChance')} cells={[{label: '1X', line: markets.doubleChance.homeOrDraw}, {label: 'X2', line: markets.doubleChance.drawOrAway}, {label: '12', line: markets.doubleChance.homeOrAway}]} />
                        <MarketGroup title={t('groups.goals')} cells={[{label: t('labels.over', {line: '1,5'}), line: markets.goals.over15}, {label: t('labels.over', {line: '2,5'}), line: markets.goals.over25}, {label: t('labels.over', {line: '3,5'}), line: markets.goals.over35}]} />
                        <MarketGroup title={t('groups.under')} cells={[{label: t('labels.under', {line: '1,5'}), line: markets.goals.under15}, {label: t('labels.under', {line: '2,5'}), line: markets.goals.under25}, {label: t('labels.under', {line: '3,5'}), line: markets.goals.under35}]} />
                        <MarketGroup title={t('groups.btts')} cells={[{label: t('labels.goal'), line: markets.btts.yes}, {label: t('labels.noGoal'), line: markets.btts.no}]} />
                        {prediction && (
                            <div className="flex flex-col gap-1 min-w-0">
                                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('groups.scores')}</span>
                                <ul className="flex flex-wrap gap-1">
                                    {prediction.scores.slice(0, 5).map((s, i) => (
                                        <li key={`${s.home}-${s.away}`} className={cn("inline-flex items-center gap-1.5 px-2 h-8 rounded border-2 border-foreground font-mono text-[12px] font-extrabold tabular-nums", i === 0 ? "bg-accent" : "bg-card")}>
                                            {s.home}-{s.away}
                                            <span className="text-[10px] text-muted-foreground">{s.pct.toFixed(1)}%</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </Panel>
            )}

            {!data ? (
                <Panel title={t('bandsTitle')}><p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('empty')}</p></Panel>
            ) : (
                <>
                    <Panel title={t('bandsTitle')} action={help(t('bandsHint'))}>
                        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-muted">
                            <GoalBands profile={h} team={home} scale={scale} />
                            <GoalBands profile={a} team={away} scale={scale} />
                        </div>
                        <p className="px-3 py-1.5 border-t border-muted text-[11px] font-semibold text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-accent border border-foreground/60" aria-hidden="true" />{t('legend.for')}</span>
                            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-foreground" aria-hidden="true" />{t('legend.against')}</span>
                            <span>{t('legend.peak')}</span>
                        </p>
                    </Panel>
                    <Panel title={t('linesTitle')} action={help(t('linesHint'))}>
                        {heads}
                        {table(rows)}
                        <p className="px-3 py-1.5 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{base}</p>
                    </Panel>
                    <Panel title={t('setPiecesTitle')} action={help(t('setPiecesHint'))}>
                        {heads}
                        {table(setPieces)}
                        {(data.expected.corners !== null || data.expected.yellows !== null) && (
                            <p className="px-3 py-1.5 border-t border-muted text-[12px] font-semibold leading-snug">
                                {data.expected.corners !== null && <span>{t('expectedCorners', {value: data.expected.corners.toFixed(1)})}</span>}
                                {data.expected.corners !== null && data.expected.yellows !== null && ' · '}
                                {data.expected.yellows !== null && <span>{t('expectedYellows', {value: data.expected.yellows.toFixed(1)})}</span>}
                            </p>
                        )}
                    </Panel>
                </>
            )}
        </div>
    );
}
