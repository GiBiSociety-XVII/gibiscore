'use client';

import {ChevronDown, ChevronUp, HelpCircle, History} from "lucide-react";
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {SavedTeam} from "@/lib/fantasy/config";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import {roundNumber} from "@/lib/fantasy/matchday";
import {scoreRound, withManualVotes, type RoundResults} from "@/lib/fantasy/recap";
import {votesKey, votesStore, type LineupLock} from "@/lib/fantasy/store";
import {defenceOption} from "@/lib/fantasy/strategies";
import type {VotoCalibration} from "@/lib/fantasy/voto";
import type {ResultsResponse} from "@/app/api/fantasy/results/route";

const roundName = (round: string) => (/^Regular Season - \d+$/.test(round) ? round.slice('Regular Season - '.length) : round);
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));

interface HistoryRow {
    round: string;
    live: boolean;
    advised: number | null;
    formation: string | null;
    best: number | null;
    bestFormation: string | null;
    typed: number;
}

/**
 * The recaps of the rounds gone by: what the advised lineup scored in
 * each against the best eleven with hindsight, and the two added up.
 * The rounds before the current one come from the results API, cut to
 * the roster; the advice of each round is its lock, kept when the page
 * was open before that round's kick-off.
 */
export function RecapHistory({team, roster, current, locks, seasonId, calibration}: {team: SavedTeam; roster: AuctionPlayer[]; /** The round of the recap, from the page. */ current: RoundResults[]; /** Every lock kept for the team, any round. */ locks: LineupLock[]; seasonId: number; calibration: VotoCalibration}) {
    const t = useTranslations('Fantasy.lineup.history');
    const [open, setOpen] = useState(false);
    const [past, setPast] = useState<{key: string; rounds: RoundResults[]} | null>(null);
    const [failed, setFailed] = useState(false);
    const allVotes = votesStore.useValue();
    const ids = roster.map((p) => p.id).sort((a, b) => a - b).join(',');
    const key = `${team.league}:${ids}`;

    useEffect(() => {
        if (ids === '') return;
        let alive = true;
        fetch(`/api/fantasy/results?league=${team.league}&ids=${ids}`, {cache: 'no-store'})
            .then((res) => (res.ok ? (res.json() as Promise<ResultsResponse>) : Promise.reject(new Error(String(res.status)))))
            .then((body) => {
                if (alive) setPast({key, rounds: body.rounds});
            })
            .catch(() => {
                if (alive) setFailed(true);
            });
        return () => {
            alive = false;
        };
    }, [ids, key, team.league]);

    const loaded = past?.key === key ? past.rounds : null;
    // Every round known, the current one included, newest first; the same round once.
    const byRound = new Map<string, RoundResults>();
    for (const r of [...(loaded ?? []), ...current]) byRound.set(r.round, r);
    const rounds = [...byRound.values()].sort((a, b) => (roundNumber(b.round) ?? 0) - (roundNumber(a.round) ?? 0));
    const defence = defenceOption(team);
    const lp = roster.map((p) => ({id: p.id, role: p.role}));
    const rows: HistoryRow[] = rounds.map((results) => {
        const shown = withManualVotes(results, allVotes[votesKey(seasonId, results.round)]);
        const lock = locks.find((l) => l.round === results.round) ?? null;
        const finished = new Set(results.finishedTeams);
        const pending = new Set(roster.filter((p) => !finished.has(p.team.id)).map((p) => p.id));
        const {advice, played, best} = scoreRound({rules: team.rules, formation: team.formation, defence}, lp, shown, lock, calibration, pending);
        return {round: results.round, live: results.state === 'live', advised: played?.total ?? null, formation: advice?.formation ?? null, best: best?.total ?? null, bestFormation: best?.formation ?? null, typed: roster.filter((p) => shown.stats[p.id]?.source !== undefined).length};
    });
    // The sums over the rounds over and with an advice kept: the ones where both numbers mean the same thing.
    const counted = rows.filter((r) => !r.live && r.advised !== null && r.best !== null);
    const sumAdvised = counted.reduce((s, r) => s + r.advised!, 0);
    const sumBest = counted.reduce((s, r) => s + r.best!, 0);
    const missing = rows.filter((r) => !r.live && r.advised === null).length;

    return (
        <Panel
            title={<span className="inline-flex items-center gap-1.5"><History className="w-4 h-4" aria-hidden="true" />{t('title')}</span>}
            action={
                <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="bb-btn bg-card h-7 px-2 text-[11px] font-extrabold inline-flex items-center gap-1">
                    {open ? t('close') : t('details')}
                    {open ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
                </button>
            }
        >
            <div className="px-3 py-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] font-semibold">
                {counted.length > 0 ? (
                    <>
                        <span className="inline-flex items-baseline gap-1.5" title={t('advisedHint')}>
                            <span className="font-mono text-[20px] font-extrabold tabular-nums leading-none">{fmt(sumAdvised)}</span>
                            <span className="text-muted-foreground">{t('advisedSum', {count: counted.length})}</span>
                        </span>
                        <span className="inline-flex items-baseline gap-1.5" title={t('bestHint')}>
                            <span className="font-mono text-[15px] font-extrabold tabular-nums">{fmt(sumBest)}</span>
                            <span className="text-muted-foreground">{t('bestSum')}</span>
                            <span className={cn("bb-badge text-[10px] h-5 px-1.5", sumAdvised - sumBest >= -counted.length ? "bg-emerald-200" : sumAdvised - sumBest >= -5 * counted.length ? "bg-amber-200" : "bg-red-200")}>{signed(Math.round((sumAdvised - sumBest) * 10) / 10)}</span>
                        </span>
                        <span className="text-muted-foreground">{t('perRound', {advised: fmt(Math.round((sumAdvised / counted.length) * 10) / 10), best: fmt(Math.round((sumBest / counted.length) * 10) / 10)})}</span>
                    </>
                ) : (
                    <span className="text-muted-foreground">{loaded === null && !failed && ids !== '' ? t('loading') : failed && loaded === null ? t('failed') : t('none')}</span>
                )}
                {missing > 0 && <span className="text-muted-foreground">{t('missing', {count: missing})}</span>}
            </div>
            {open && rows.length > 0 && (
                <div className="overflow-x-auto border-t-2 border-foreground">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                <th className="px-2 py-1.5 text-left">{t('colRound')}</th>
                                <th className="px-2 py-1.5 text-right">{t('colAdvised')}</th>
                                <th className="px-2 py-1.5 text-right">{t('colBest')}</th>
                                <th className="px-2 py-1.5 text-right">{t('colGap')}</th>
                                <th className="px-2 py-1.5 text-right">{t('colTyped')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => {
                                const gap = r.advised !== null && r.best !== null ? Math.round((r.advised - r.best) * 10) / 10 : null;
                                return (
                                    <tr key={r.round} className={cn("border-b border-muted last:border-b-0", i % 2 === 1 && "bg-muted/30")}>
                                        <td className="px-2 py-1 font-extrabold">{t('round', {round: roundName(r.round)})}{r.live && <span className="bb-badge bg-amber-200 text-[9px] h-4 px-1 ml-1.5">{t('live')}</span>}</td>
                                        <td className="px-2 py-1 text-right font-mono font-extrabold tabular-nums whitespace-nowrap">{r.advised !== null ? <>{fmt(r.advised)} <span className="text-[10px] font-bold text-muted-foreground">{r.formation}</span></> : <span className="text-muted-foreground font-semibold" title={t('noLockHint')}>{t('noLock')}</span>}</td>
                                        <td className="px-2 py-1 text-right font-mono font-bold tabular-nums whitespace-nowrap">{r.best !== null ? <>{fmt(r.best)} <span className="text-[10px] font-bold text-muted-foreground">{r.bestFormation}</span></> : '–'}</td>
                                        <td className="px-2 py-1 text-right">{gap !== null ? <span className={cn("bb-badge font-mono tabular-nums h-5 px-1 text-[11px] font-bold", gap >= -1 ? "bg-emerald-200" : gap >= -5 ? "bg-amber-200" : "bg-red-200")}>{signed(gap)}</span> : '–'}</td>
                                        <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">{r.typed > 0 ? `${r.typed}/${roster.length}` : '–'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted"><span title={t('hint')} className="inline-flex items-center gap-1 mr-2"><HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />{t('hintShort')}</span><Link href="/fantacalcio/modello" className="text-foreground font-extrabold hover:underline decoration-accent decoration-[2px] underline-offset-2">{t('modelLink')}</Link></p>
                </div>
            )}
        </Panel>
    );
}
