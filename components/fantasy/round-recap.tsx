'use client';

import {ChevronDown, ChevronUp, ClipboardCheck} from "lucide-react";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {RoleBadge} from "./role-badge";
import type {SavedTeam} from "@/lib/fantasy/config";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import {recommendLineup, type PlayerForecast} from "@/lib/fantasy/matchday";
import {bestHindsight, playLineup, roundPoints, surprises, votoOf, MAX_SUBS, type PlayedSlot, type RoundResults, type RoundStat} from "@/lib/fantasy/recap";
import type {FantaRole} from "@/lib/fantasy/scores";
import type {LineupLock} from "@/lib/fantasy/store";
import {defenceOption, type FormationKey} from "@/lib/fantasy/strategies";
import type {VotoCalibration} from "@/lib/fantasy/voto";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const roundName = (round: string) => (/^Regular Season - \d+$/.test(round) ? round.slice('Regular Season - '.length) : round);
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));

/** The events the game paid, in words. */
function Events({stat, role}: {stat: RoundStat | undefined; role: FantaRole}) {
    const t = useTranslations('Fantasy.lineup.recap.events');
    if (!stat) return null;
    const parts: string[] = [];
    if (stat.goals > 0) parts.push(t('goals', {count: stat.goals}));
    if (stat.assists > 0) parts.push(t('assists', {count: stat.assists}));
    if (role === 'P' && stat.conceded > 0) parts.push(t('conceded', {count: stat.conceded}));
    if (role === 'P' && stat.conceded === 0 && stat.minutes >= 60) parts.push(t('cleanSheet'));
    if (stat.penaltiesSaved > 0) parts.push(t('penaltySaved'));
    if (stat.penaltiesMissed > 0) parts.push(t('penaltyMissed'));
    if (stat.ownGoals > 0) parts.push(t('ownGoal'));
    if (stat.yellow > 0) parts.push(t('yellow'));
    if (stat.red > 0) parts.push(t('red'));
    return <span className="text-[11px] font-semibold text-muted-foreground">{parts.join(' · ')}</span>;
}

function deltaClass(delta: number): string {
    if (delta >= 2) return "bg-emerald-200";
    if (delta >= 0.75) return "bg-emerald-100";
    if (delta <= -2) return "bg-red-200";
    if (delta <= -0.75) return "bg-red-100";
    return "bg-card";
}

interface Row {
    id: number;
    role: FantaRole;
    voto: number | null;
    points: number | null;
    expected: number | null;
    note: string | null;
    muted: boolean;
    inBest: boolean;
}

/**
 * The round just played: what the advised lineup scored (with the
 * league's automatic substitutions), the best eleven with hindsight,
 * the surprises against the forecast, every player's vote and events.
 */
export function RoundRecap({team, results, roster, byId, past, calibration}: {team: SavedTeam; results: RoundResults; roster: AuctionPlayer[]; byId: Map<number, AuctionPlayer>; past: LineupLock | null; calibration: VotoCalibration}) {
    const t = useTranslations('Fantasy.lineup.recap');
    const [open, setOpen] = useState(false);
    const defence = defenceOption(team);
    const nameOf = (id: number) => byId.get(id)?.name ?? '–';
    const lp = (p: {id: number; role: FantaRole}) => ({id: p.id, role: p.role});
    const best = bestHindsight(roster.map(lp), results, team.rules, calibration, defence);
    const inBest = new Set(best?.ids ?? []);

    // The advice as it stood at the lock, replayed with its pins and forced formation, then scored.
    const forecasts = past ? (past.forecasts as PlayerForecast[]).filter((f) => byId.has(f.player.id)) : [];
    const advice = past ? recommendLineup(forecasts, {rules: team.rules, defenceModifier: defence, prefer: team.formation as FormationKey | null, force: past.forced as FormationKey | null, pinned: new Set(past.pinned)}) : null;
    const played = advice ? playLineup(advice.starters.map((f) => lp(f.player)), advice.bench.map((f) => lp(f.player)), results, team.rules, calibration, defence) : null;
    const expectedOf = new Map(forecasts.map((f) => [f.player.id, f.points]));
    const gaps = surprises(forecasts.map((f) => ({id: f.player.id, role: f.player.role, points: f.points})), results, team.rules, calibration).slice(0, 4);

    const toRow = (s: PlayedSlot, note: string | null, muted: boolean): Row => ({id: s.id, role: s.role, voto: s.voto, points: s.points, expected: expectedOf.get(s.id) ?? null, note, muted, inBest: inBest.has(s.id)});
    const rows: Row[] = played
        ? [
              ...played.slots.map((s) => toRow(s, s.replacedBy !== undefined ? t('replaced', {name: nameOf(s.replacedBy)}) : s.replaces !== undefined ? t('cameIn', {name: nameOf(s.replaces)}) : s.points === null ? t('hole') : null, s.points === null)),
              ...played.bench.map((s) => toRow(s, t('benchLabel'), true)),
          ]
        : ROLES.flatMap((role) =>
              roster
                  .filter((p) => p.role === role)
                  .map((p) => ({id: p.id, role, voto: votoOf(results.stats[p.id], role, results.official, calibration), points: roundPoints(results.stats[p.id], role, team.rules, results.official, calibration), expected: null, note: null, muted: false, inBest: inBest.has(p.id)}))
                  .sort((a, b) => (b.points ?? -99) - (a.points ?? -99)),
          );
    const gap = played && best ? Math.round((played.total - best.total) * 10) / 10 : null;

    return (
        <Panel
            title={<span className="inline-flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4" aria-hidden="true" />{t('title', {round: roundName(results.round)})}</span>}
            action={<span className={cn("bb-badge text-[10px] h-5 px-1.5 shrink-0", results.official ? "bg-emerald-200" : "bg-amber-200")} title={results.official ? t('officialHint') : t('estimatedHint')}>{results.official ? t('official') : t('estimated')}</span>}
        >
            <div className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-semibold">
                {played && advice ? (
                    <span className="inline-flex items-baseline gap-1.5" title={t('advisedHint', {subs: MAX_SUBS})}>
                        <span className="font-mono text-[22px] font-extrabold tabular-nums leading-none">{fmt(played.total)}</span>
                        <span className="text-muted-foreground">{t('advised')} · {advice.formation}</span>
                    </span>
                ) : (
                    <span className="text-muted-foreground max-w-prose">{t('noPast')}</span>
                )}
                {best && (
                    <span className="inline-flex items-baseline gap-1.5" title={t('bestHint')}>
                        <span className="font-mono text-[15px] font-extrabold tabular-nums">{fmt(best.total)}</span>
                        <span className="text-muted-foreground">{t('best')} · {best.formation}</span>
                        {gap !== null && <span className={cn("bb-badge text-[10px] h-5 px-1.5", gap >= -1 ? "bg-emerald-200" : gap >= -5 ? "bg-amber-200" : "bg-red-200")}>{t('gap', {gap: signed(gap)})}</span>}
                    </span>
                )}
                {!best && <span className="text-muted-foreground">{t('noBest')}</span>}
                {played && (
                    <span className="text-muted-foreground">
                        {t('subs', {count: played.subs})}
                        {played.holes > 0 && <span className="text-red-700"> · {t('holes', {count: played.holes})}</span>}
                        {played.defence > 0 && ` · ${t('defence', {points: fmt(played.defence)})}`}
                    </span>
                )}
                <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="bb-btn bg-card h-7 px-2 text-[11px] font-extrabold inline-flex items-center gap-1 ml-auto">
                    {open ? t('close') : t('details')}
                    {open ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
                </button>
            </div>
            {gaps.length > 0 && (
                <p className="px-3 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold" title={t('surprisesHint')}>
                    <span className="text-muted-foreground">{t('surprises')}</span>
                    {gaps.map((g) => (
                        <span key={g.id} className={cn("bb-badge h-5 px-1.5 font-mono tabular-nums", deltaClass(g.delta))}>{nameOf(g.id)} {signed(g.delta)}</span>
                    ))}
                </p>
            )}
            {open && (
                <div className="overflow-x-auto border-t-2 border-foreground">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                <th className="px-2 py-1.5 text-left w-8">R</th>
                                <th className="px-2 py-1.5 text-left">{t('colPlayer')}</th>
                                <th className="px-2 py-1.5 text-right">{t('colVoto')}</th>
                                <th className="px-2 py-1.5 text-left">{t('colEvents')}</th>
                                <th className="px-2 py-1.5 text-right">{t('colPoints')}</th>
                                {played && <th className="px-2 py-1.5 text-right">{t('colExpected')}</th>}
                                {played && <th className="px-2 py-1.5 text-right">{t('colDelta')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => {
                                const delta = r.points !== null && r.expected !== null ? Math.round((r.points - r.expected) * 10) / 10 : null;
                                return (
                                    <tr key={r.id} className={cn("border-b border-muted last:border-b-0", i % 2 === 1 && "bg-muted/30", r.muted && "text-muted-foreground")}>
                                        <td className="px-2 py-1"><RoleBadge role={r.role} /></td>
                                        <td className="px-2 py-1">
                                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                <span className={cn("font-extrabold", r.muted && "font-bold")}>{nameOf(r.id)}</span>
                                                {r.inBest && <span className="bb-badge bg-accent text-[9px] h-4 px-1" title={t('bestHint')}>{t('inBest')}</span>}
                                                {r.note && <span className="text-[10px] font-semibold text-muted-foreground">{r.note}</span>}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1 text-right font-mono font-bold tabular-nums">{r.voto !== null ? fmt(r.voto) : <span className="text-muted-foreground">{t('noVote')}</span>}</td>
                                        <td className="px-2 py-1"><Events stat={results.stats[r.id]} role={r.role} /></td>
                                        <td className="px-2 py-1 text-right font-mono font-extrabold tabular-nums">{r.points !== null ? fmt(r.points) : '–'}</td>
                                        {played && <td className="px-2 py-1 text-right font-mono font-bold tabular-nums text-muted-foreground">{r.expected !== null ? r.expected.toFixed(1) : '–'}</td>}
                                        {played && <td className="px-2 py-1 text-right font-mono tabular-nums text-[11px] font-bold">{delta === null ? '–' : Math.abs(delta) >= 0.75 ? <span className={cn("bb-badge font-mono tabular-nums h-5 px-1 text-[11px] font-bold", deltaClass(delta))}>{signed(delta)}</span> : <span className="text-muted-foreground">{signed(delta)}</span>}</td>}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Panel>
    );
}
