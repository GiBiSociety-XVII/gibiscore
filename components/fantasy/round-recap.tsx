'use client';

import {ChevronDown, ChevronUp, ClipboardCheck, Pencil, RotateCcw} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {RoleBadge} from "./role-badge";
import type {SavedTeam} from "@/lib/fantasy/config";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import {recommendLineup, type PlayerForecast} from "@/lib/fantasy/matchday";
import {bestHindsight, EMPTY_STAT, matchLabel, playLineup, roundPoints, surprises, toVotoEstimate, votoOf, withManualVotes, MAX_SUBS, type ManualVote, type PlayedSlot, type RoundResults, type RoundStat} from "@/lib/fantasy/recap";
import type {FantaRole} from "@/lib/fantasy/scores";
import {votesKey, votesStore, type LineupLock} from "@/lib/fantasy/store";
import {defenceOption, type FormationKey} from "@/lib/fantasy/strategies";
import type {VotoCalibration} from "@/lib/fantasy/voto";
import {saveVotes} from "@/lib/fantasy/votes";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const roundName = (round: string) => (/^Regular Season - \d+$/.test(round) ? round.slice('Regular Season - '.length) : round);
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));
type EventKey = 'goals' | 'assists' | 'yellow' | 'red' | 'penaltiesSaved' | 'penaltiesMissed' | 'ownGoals' | 'conceded';
const EVENT_KEYS: EventKey[] = ['goals', 'assists', 'yellow', 'red', 'penaltiesMissed', 'ownGoals', 'penaltiesSaved', 'conceded'];
const KEEPER_ONLY = new Set<EventKey>(['penaltiesSaved', 'conceded']);

/** The events the game paid, in words. */
function Events({stat, role}: {stat: RoundStat | undefined; role: FantaRole}) {
    const t = useTranslations('Fantasy.lineup.recap.events');
    if (!stat || (stat.minutes === 0 && stat.voto === undefined)) return null;
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

const NO_VOTE = new Set(['sv', 's.v.', 's.v', '0', '-', 'senza voto']);
const asText = (stat: RoundStat | undefined) => (stat?.voto === undefined ? '' : stat.voto === null ? 's.v.' : String(stat.voto));

/** The vote as typed: a number in quarters, "sv" (or 0) for no vote, empty to fall back on the site's own estimate. */
function VoteInput({stat, role, calibration, disabled, title, onChange}: {stat: RoundStat | undefined; role: FantaRole; calibration: VotoCalibration; disabled: boolean; title: string; onChange: (voto: number | null | undefined) => void}) {
    const known = stat?.voto !== undefined;
    const estimate = stat ? toVotoEstimate(stat, role, calibration) : null;
    const [text, setText] = useState(asText(stat));
    const shown = useRef(asText(stat));
    // A vote that arrives from elsewhere (the account, the server) replaces what the field shows, not what is being typed.
    const incoming = asText(stat);
    useEffect(() => {
        if (incoming !== shown.current) {
            shown.current = incoming;
            setText(incoming);
        }
    }, [incoming]);
    const commit = () => {
        const v = text.trim().replace(',', '.').toLowerCase();
        if (v === '') {
            shown.current = '';
            if (known) onChange(undefined);
            return;
        }
        if (NO_VOTE.has(v)) {
            setText('s.v.');
            shown.current = 's.v.';
            onChange(null);
            return;
        }
        const n = Number(v);
        if (!Number.isFinite(n) || n < 1 || n > 10) {
            setText(shown.current);
            return;
        }
        const rounded = Math.round(n * 4) / 4;
        setText(String(rounded));
        shown.current = String(rounded);
        onChange(rounded);
    };
    return (
        <input
            type="text"
            inputMode="decimal"
            value={text}
            disabled={disabled}
            placeholder={estimate !== null ? fmt(estimate) : '–'}
            title={title}
            aria-label={title}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className={cn("bb-input h-7 w-14 px-1 text-right font-mono text-[12px] font-extrabold tabular-nums", !known && "placeholder:text-muted-foreground/70 placeholder:font-bold", stat?.source === 'official' && "bg-emerald-50")}
        />
    );
}

/** Small counters for the events of one player, shown under his row when the pencil is on. */
function EventsEditor({stat, role, onChange}: {stat: RoundStat; role: FantaRole; onChange: (key: EventKey, value: number) => void}) {
    const t = useTranslations('Fantasy.lineup.recap.edit');
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {EVENT_KEYS.filter((k) => role === 'P' || !KEEPER_ONLY.has(k)).map((k) => (
                <label key={k} className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                    {t(k)}
                    <input type="number" min={0} max={9} step={1} value={stat[k]} onChange={(e) => onChange(k, Math.max(0, Math.min(9, Math.round(Number(e.target.value) || 0))))} className="bb-input h-6 w-10 px-1 text-right font-mono text-[11px] font-extrabold tabular-nums" aria-label={t(k)} />
                </label>
            ))}
        </span>
    );
}

interface Row {
    id: number;
    role: FantaRole;
    teamId: number;
    voto: number | null;
    points: number | null;
    expected: number | null;
    note: string | null;
    muted: boolean;
    inBest: boolean;
}

/**
 * A round played (or being played): what the advised lineup scored,
 * with the league's automatic substitutions; the best eleven with
 * hindsight; the biggest gaps against the forecast; every player's
 * vote and events, typed in by hand once his match is over. Typed votes
 * are shown at once, kept on the device and saved in the account, where
 * the model reads them back to tune its scale and the players' form.
 */
export function RoundRecap({team, results, seasonId, roster, byId, past, calibration, signedIn, onSaved}: {team: SavedTeam; results: RoundResults; seasonId: number; roster: AuctionPlayer[]; byId: Map<number, AuctionPlayer>; past: LineupLock | null; calibration: VotoCalibration; signedIn: boolean; /** Called after a save reaches the account, so the page can pull the recalibrated context. */ onSaved?: () => void}) {
    const t = useTranslations('Fantasy.lineup.recap');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const allVotes = votesStore.useValue();
    const key = votesKey(seasonId, results.round);
    const mine = allVotes[key] ?? {};
    const finished = new Set(results.finishedTeams);
    // Only the matches over count: a player still to play has no numbers, whatever the data says.
    const shown = withManualVotes({...results, stats: Object.fromEntries(Object.entries(results.stats).filter(([id]) => finished.has(byId.get(Number(id))?.team.id ?? -1)))}, mine);
    const defence = defenceOption(team);
    const nameOf = (id: number) => byId.get(id)?.name ?? '–';
    const lp = (p: {id: number; role: FantaRole}) => ({id: p.id, role: p.role});
    const best = bestHindsight(roster.map(lp), shown, team.rules, calibration, defence);
    const inBest = new Set(best?.ids ?? []);

    // The advice as it stood at the lock, replayed with its pins and forced formation, then scored.
    const forecasts = past ? (past.forecasts as PlayerForecast[]).filter((f) => byId.has(f.player.id)) : [];
    const advice = past ? recommendLineup(forecasts, {rules: team.rules, defenceModifier: defence, prefer: team.formation as FormationKey | null, force: past.forced as FormationKey | null, pinned: new Set(past.pinned)}) : null;
    // Live: whoever still has to play is neither a hole nor a substitute yet.
    const toPlay = new Set(roster.filter((p) => !finished.has(p.team.id)).map((p) => p.id));
    const played = advice ? playLineup(advice.starters.map((f) => lp(f.player)), advice.bench.map((f) => lp(f.player)), shown, team.rules, calibration, defence, MAX_SUBS, toPlay) : null;
    const expectedOf = new Map(forecasts.map((f) => [f.player.id, f.points]));
    const gaps = surprises(forecasts.map((f) => ({id: f.player.id, role: f.player.role, points: f.points})), shown, team.rules, calibration).slice(0, 4);
    const typedCount = roster.filter((p) => shown.stats[p.id]?.source !== undefined).length;

    const toRow = (s: PlayedSlot, note: string | null, muted: boolean): Row => ({id: s.id, role: s.role, teamId: byId.get(s.id)?.team.id ?? 0, voto: s.voto, points: s.points, expected: expectedOf.get(s.id) ?? null, note, muted, inBest: inBest.has(s.id)});
    const rows: Row[] = played
        ? [
              ...played.slots.map((s) => toRow(s, s.replacedBy !== undefined ? t('replaced', {name: nameOf(s.replacedBy)}) : s.replaces !== undefined ? t('cameIn', {name: nameOf(s.replaces)}) : s.points === null ? t('hole') : null, s.points === null)),
              ...played.bench.map((s) => toRow(s, t('benchLabel'), true)),
          ]
        : ROLES.flatMap((role) =>
              roster
                  .filter((p) => p.role === role)
                  .map((p): Row => ({id: p.id, role, teamId: p.team.id, voto: votoOf(shown.stats[p.id], role, calibration), points: roundPoints(shown.stats[p.id], role, team.rules, calibration), expected: null, note: null, muted: false, inBest: inBest.has(p.id)}))
                  .sort((a, b) => (b.points ?? -99) - (a.points ?? -99)),
          );
    const gap = played && best ? Math.round((played.total - best.total) * 10) / 10 : null;

    // Typing: the device store first (the page follows at once), the account a moment later, in one batch.
    const pending = useRef<{votes: Record<number, ManualVote>; remove: Set<number>}>({votes: {}, remove: new Set()});
    const timer = useRef<number | null>(null);
    const flush = () => {
        const batch = pending.current;
        pending.current = {votes: {}, remove: new Set()};
        if (Object.keys(batch.votes).length === 0 && batch.remove.size === 0) return;
        if (!signedIn) return;
        setSave('saving');
        saveVotes(seasonId, results.round, batch.votes, [...batch.remove]).then(
            () => {
                setSave('saved');
                onSaved?.();
            },
            () => setSave('error'),
        );
    };
    useEffect(() => () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
    }, []);
    const schedule = () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 1500);
    };
    const write = (id: number, vote: ManualVote | null) => {
        const next = {...mine};
        if (vote) next[id] = vote;
        else delete next[id];
        votesStore.write({...allVotes, [key]: next});
        if (vote) {
            pending.current.votes[id] = vote;
            pending.current.remove.delete(id);
        } else {
            delete pending.current.votes[id];
            pending.current.remove.add(id);
        }
        schedule();
    };
    // What is typed for him so far: the vote only when it was typed (a null vote leaves the site's own).
    const baseOf = (id: number, teamId: number): ManualVote => {
        const s = shown.stats[id] ?? EMPTY_STAT;
        const typedVoto = mine[id]?.voto ?? (s.source === 'manual' ? (s.voto ?? 0) : null);
        return {teamId, voto: typedVoto, goals: s.goals, assists: s.assists, yellow: s.yellow, red: s.red, conceded: s.conceded, penaltiesSaved: s.penaltiesSaved, penaltiesMissed: s.penaltiesMissed, ownGoals: s.ownGoals, at: new Date().toISOString()};
    };
    // Cleared: the site's own vote again, the events typed stay. "sv": a typed no vote, stored as 0.
    const setVote = (id: number, teamId: number, voto: number | null | undefined) => write(id, {...baseOf(id, teamId), voto: voto === undefined ? null : voto === null ? 0 : voto, at: new Date().toISOString()});
    // Everything typed for this round, on the device and in the account, thrown away.
    const reset = () => {
        if (!window.confirm(t('resetConfirm'))) return;
        const ids = [...new Set([...Object.keys(mine).map(Number), ...roster.filter((p) => results.stats[p.id]?.source === 'manual').map((p) => p.id)])];
        const rest = {...allVotes};
        delete rest[key];
        votesStore.write(rest);
        pending.current = {votes: {}, remove: new Set(ids)};
        if (timer.current !== null) window.clearTimeout(timer.current);
        flush();
    };
    const setEvent = (id: number, teamId: number, k: EventKey, value: number) => write(id, {...baseOf(id, teamId), [k]: value, at: new Date().toISOString()});

    const live = results.state === 'live';
    return (
        <Panel
            title={<span className="inline-flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4" aria-hidden="true" />{t('title', {round: roundName(results.round)})}{live && <span className="bb-badge bg-amber-200 text-[9px] h-4 px-1 normal-case tracking-normal">{t('live')}</span>}</span>}
            action={
                <span className="inline-flex items-center gap-1.5 shrink-0">
                    {typedCount > 0 && <span className="text-[10px] font-bold text-muted-foreground hidden sm:inline">{t('typedCount', {count: typedCount})}</span>}
                    <span className={cn("bb-badge text-[10px] h-5 px-1.5", results.official ? "bg-emerald-200" : "bg-amber-200")} title={results.official ? t('officialHint') : t('estimatedHint')}>{results.official ? t('official') : t('estimated')}</span>
                </span>
            }
        >
            <p className="px-3 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold border-b border-muted">
                <span className="text-muted-foreground">{results.matches.some((m) => m.finished) ? t('finished', {done: results.matches.filter((m) => m.finished).length, total: results.matches.length}) : t('noneFinished')}</span>
                {results.matches.filter((m) => m.finished).map((m) => <span key={`${m.home.id}-${m.away.id}`} className="font-bold">{m.home.name} <span className="font-mono">{m.score ? `${m.score[0]}-${m.score[1]}` : '–'}</span> {m.away.name}</span>)}
            </p>
            <div className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-semibold">
                {played && advice ? (
                    <span className="inline-flex items-baseline gap-1.5" title={t('advisedHint', {subs: MAX_SUBS})}>
                        <span className="font-mono text-[22px] font-extrabold tabular-nums leading-none">{fmt(played.total)}</span>
                        <span className="text-muted-foreground">{live ? t('advisedPartial') : t('advised')} · {advice.formation}</span>
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
                {!best && !live && <span className="text-muted-foreground">{t('noBest')}</span>}
                {played && (
                    <span className="text-muted-foreground">
                        {t('subs', {count: played.subs})}
                        {played.holes > 0 && <span className="text-red-700"> · {t('holes', {count: played.holes})}</span>}
                        {played.pending > 0 && ` · ${t('pending', {count: played.pending})}`}
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
                <div className="border-t-2 border-foreground">
                    <p className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground border-b border-muted">
                        <span>{t('voteHint')}</span>
                        <span className={cn("ml-auto font-bold", save === 'error' && "text-red-700")}>{!signedIn ? t('signInToSave') : save === 'saving' ? t('saving') : save === 'saved' ? t('saved') : save === 'error' ? t('saveError') : t('autoSave')}</span>
                        {typedCount > 0 && <button type="button" onClick={reset} className="bb-btn bg-card h-6 px-2 text-[10px] font-extrabold inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" aria-hidden="true" />{t('reset')}</button>}
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead>
                                <tr className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                    <th className="px-2 py-1.5 text-left w-8">R</th>
                                    <th className="px-2 py-1.5 text-left">{t('colPlayer')}</th>
                                    <th className="px-2 py-1.5 text-right">{t('colVoto')}</th>
                                    <th className="px-2 py-1.5 text-left" title={t('colEventsHint')}>{t('colEvents')}</th>
                                    <th className="px-2 py-1.5 text-right">{t('colPoints')}</th>
                                    {played && <th className="px-2 py-1.5 text-right">{t('colExpected')}</th>}
                                    {played && <th className="px-2 py-1.5 text-right">{t('colDelta')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => {
                                    const delta = r.points !== null && r.expected !== null ? Math.round((r.points - r.expected) * 10) / 10 : null;
                                    const stat = shown.stats[r.id];
                                    const canVote = finished.has(r.teamId);
                                    const isEditing = editing === r.id;
                                    return (
                                        <tr key={r.id} className={cn("border-b border-muted last:border-b-0 align-top", i % 2 === 1 && "bg-muted/30", r.muted && "text-muted-foreground")}>
                                            <td className="px-2 py-1"><RoleBadge role={r.role} /></td>
                                            <td className="px-2 py-1">
                                                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                    <span className={cn("font-extrabold", r.muted && "font-bold")}>{nameOf(r.id)}</span>
                                                    {r.inBest && <span className="bb-badge bg-accent text-[9px] h-4 px-1" title={t('bestHint')}>{t('inBest')}</span>}
                                                    {stat?.source && <span className={cn("bb-badge text-[9px] h-4 px-1", stat.source === 'official' ? "bg-emerald-200" : "bg-card")}>{t(`source.${stat.source}`)}</span>}
                                                    {r.note && <span className="text-[10px] font-semibold text-muted-foreground">{r.note}</span>}
                                                </span>
                                                <span className="block text-[10px] font-semibold text-muted-foreground truncate">{matchLabel(shown, r.teamId) ?? t('notFinished')}</span>
                                            </td>
                                            <td className="px-2 py-1 text-right">
                                                {canVote && stat?.source !== 'official' ? (
                                                    <VoteInput stat={stat} role={r.role} calibration={calibration} disabled={false} title={t('voteLabel', {name: nameOf(r.id)})} onChange={(v) => setVote(r.id, r.teamId, v)} />
                                                ) : (
                                                    <span className="font-mono font-bold tabular-nums">{r.voto !== null ? fmt(r.voto) : <span className="text-muted-foreground">{canVote ? t('noVote') : '–'}</span>}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1">
                                                <span className="flex items-start gap-1.5">
                                                    {isEditing && stat ? <EventsEditor stat={stat} role={r.role} onChange={(k, v) => setEvent(r.id, r.teamId, k, v)} /> : <Events stat={stat} role={r.role} />}
                                                    {canVote && stat?.source !== 'official' && (
                                                        <button type="button" onClick={() => setEditing(isEditing ? null : r.id)} aria-pressed={isEditing} aria-label={t('editEvents')} title={t('editEvents')} className={cn("inline-flex w-6 h-6 shrink-0 items-center justify-center rounded border border-foreground/40", isEditing ? "bg-foreground text-background" : "bg-card")}><Pencil className="w-3 h-3" aria-hidden="true" /></button>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-2 py-1 text-right font-mono font-extrabold tabular-nums">{r.points !== null ? fmt(r.points) : '–'}</td>
                                            {played && <td className="px-2 py-1 text-right font-mono font-bold tabular-nums text-muted-foreground">{r.expected !== null ? r.expected.toFixed(1) : '–'}</td>}
                                            {played && <td className="px-2 py-1 text-right font-mono tabular-nums text-[11px] font-bold">{delta === null ? '–' : Math.abs(delta) >= 0.75 ? <span className={cn("bb-badge font-mono tabular-nums h-5 px-1 text-[11px] font-bold", deltaClass(delta))}>{signed(delta)}</span> : <span className="text-muted-foreground">{signed(delta)}</span>}</td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </Panel>
    );
}
