'use client';

import {ArrowLeftRight, BookOpen, Lock, Pin, Settings2, Sparkles, Trash2} from "lucide-react";
import {Tour} from "./tour";
import {useEffect, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link, useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {Help} from "./help";
import {DEFAULT_RULES, type AuctionConfig} from "@/lib/fantasy/config";
import type {AuctionPlayer, AuctionPool} from "@/lib/fantasy/data";
import type {TeamSummary} from "@/lib/football/types";
import {forecastPlayer, recommendLineup, type MatchdayPlayer, type PlayerContext, type PlayerForecast} from "@/lib/fantasy/matchday";
import type {MatchdayContext} from "@/lib/fantasy/matchday-data";
import {fantaAvgFor, type FantaRole} from "@/lib/fantasy/scores";
import {benchedStore, HISTORY_ROUNDS, historyStore, locksStore, outsStore, pinsStore, teamsStore, useHydrated, type LineupLock} from "@/lib/fantasy/store";
import type {MatchdayRound} from "@/lib/fantasy/matchday-data";
import type {SavedTeam} from "@/lib/fantasy/config";
import {defenceOption, FORMATIONS, type FormationKey} from "@/lib/fantasy/strategies";
import {hashOf} from "@/lib/fantasy/hash";
import {lineupPath} from "@/lib/fantasy/routes";
import {AccountTeamsBadge, useAccountTeams} from "./account-teams";
import {BenchStrip, FantasyPitch} from "./lineup/pitch";
import {ForecastCard, ForecastRow, Head} from "./lineup/rows";
import {useReasonText} from "./lineup/shared";
import {LiveScorePanel} from "./live-score";
import {AutoRefresh} from "@/components/football/auto-refresh";
import {liveScore} from "@/lib/fantasy/live-score";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const ROME = 'Europe/Rome';
const TOUR_KEY = 'gibiscore:lineup-tour:v1';
/** The guide's stops, in order: each a `data-tour` on the page. */
const TOUR_STEPS = ['team', 'status', 'liveScore', 'fixtures', 'pitch', 'bench', 'pins', 'starters', 'formations', 'how'] as const;
/** Bumped when the forecast changes scale or meaning: a frozen snapshot from before is drawn again. 2: votes on the fantasy scale. */
const LINEUP_MODEL = 2;

/** The pool's players as the league sees them: roles corrected by hand, cups in or out, the league's own rules. */
function leaguePlayers(pool: AuctionPool, config: Pick<AuctionConfig, 'roleOverrides' | 'cupsCount' | 'rules'>): AuctionPlayer[] {
    const overrides = config.roleOverrides;
    const fixed = Object.keys(overrides).length > 0 ? pool.players.map((p) => (overrides[String(p.id)] && overrides[String(p.id)] !== p.role ? {...p, role: overrides[String(p.id)], roleSource: 'manual' as const} : p)) : pool.players;
    const chosen = config.cupsCount ? fixed : fixed.map((p) => ({...p, scores: p.scoresLeagueOnly}));
    const classic = (Object.keys(DEFAULT_RULES) as Array<keyof typeof DEFAULT_RULES>).every((k) => config.rules[k] === DEFAULT_RULES[k]);
    return classic ? chosen : chosen.map((p) => (p.scores.events ? {...p, scores: {...p.scores, fantaAvg: fantaAvgFor(p.scores.events, p.role, config.rules)}} : p));
}

function toMatchdayPlayer(p: AuctionPlayer): MatchdayPlayer {
    return {id: p.id, name: p.name, slug: p.slug, role: p.role, team: {id: p.team.id, name: p.team.name}, penaltyTaker: p.penaltyTaker, scores: {starter: p.scores.starter, fantaAvg: p.scores.fantaAvg, events: p.scores.events}};
}

/** The club's use of the player this season, plus the official lineup: out when his club published one without him. */
function contextOf(p: AuctionPlayer, ctx: MatchdayContext, manualOut: boolean): PlayerContext | null {
    const known = ctx.players[p.id];
    const official = ctx.official[p.id] ?? (ctx.officialTeams.includes(p.team.id) ? 'out' : null);
    // Never in a matchday squad this season: out of every match his club played (the auction's mark still says a little).
    const recent = known?.recent && known.recent.length > 0 ? known.recent : (ctx.teamRecent[p.team.id] ?? []).map((fixtureId) => ({fixtureId, status: 'out' as const, minutes: 0, rating: null, goals: 0, assists: 0}));
    // Marked out by hand: the news is ahead of the data, and it beats even the official lineup.
    if (manualOut) return {teamId: known?.teamId ?? p.team.id, recent, sidelined: {category: 'manual', description: null, longTerm: false}, official: null};
    if (!known && !official && recent.length === 0) return null;
    return {teamId: known?.teamId ?? p.team.id, recent, sidelined: known?.sidelined ?? null, official};
}

/** "Regular Season - 10" reads as 10; anything else as it is. */
const roundName = (round: string) => (/^Regular Season - \d+$/.test(round) ? round.slice('Regular Season - '.length) : round);

/**
 * The lineup advice for a matchday: one of my teams (saved by the
 * auction board, one per fantasy league) valued for the round ahead, the
 * formation that gets the most out of it, the eleven on a pitch and the
 * whole rest of the roster as an ordered bench, with the reasons behind
 * every chance and every point.
 */
export function LineupPlanner({pool, context}: {pool: AuctionPool | null; context: MatchdayContext | null}) {
    const t = useTranslations('Fantasy.lineup');
    const ts = useTranslations('Fantasy.setup');
    const router = useRouter();
    const hydrated = useHydrated();
    const saved = teamsStore.useValue();
    const account = useAccountTeams();

    if (!hydrated) return <p className="text-sm font-semibold text-muted-foreground">…</p>;
    const teams = [...saved.teams].sort((a, b) => a.leagueName.localeCompare(b.leagueName) || a.name.localeCompare(b.name));
    const current = teams.find((x) => x.id === saved.current) ?? teams[0];
    if (!current) {
        return (
            <Panel title={t('title')}>
                <div className="px-3 py-3 flex flex-col gap-3">
                    <p className="text-[13px] font-semibold">{t('noTeams')}</p>
                    <AccountTeamsBadge status={account.status} next="/fantacalcio/formazione" />
                    <Link href="/fantacalcio/asta" className="bb-btn bg-accent px-4 h-10 inline-flex items-center self-start text-[13px] font-extrabold">{t('goSetup')}</Link>
                </div>
            </Panel>
        );
    }
    if (pool && pool.league !== current.league) {
        router.replace(lineupPath(current.league));
        return <p className="text-sm font-semibold text-muted-foreground">…</p>;
    }
    if (!pool) return <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('noPool')}</p>;

    const players = leaguePlayers(pool, current);
    const byId = new Map(players.map((p) => [p.id, p]));
    const roster = current.players.map((id) => byId.get(id)).filter((p): p is AuctionPlayer => !!p);
    const roundInfo = context?.rounds.find((r) => r.round === context.round) ?? null;
    const leagueLabel = (x: typeof current) => x.leagueName || ts(`leagues.${x.league}`);
    const choose = (id: string) => teamsStore.write({...saved, current: id});
    const remove = () => {
        if (!window.confirm(t('removeConfirm', {team: current.name, league: leagueLabel(current)}))) return;
        teamsStore.write({teams: saved.teams.filter((x) => x.id !== current.id), current: null});
    };

    const toolbar = (
        <div data-tour="team" className="bb-surface px-3 py-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-bold min-w-0">
                <span className="text-muted-foreground">{t('teamLabel')}</span>
                <select value={current.id} onChange={(e) => choose(e.target.value)} className="bb-input h-8 px-2 text-[12px] font-extrabold max-w-[260px]">
                    {teams.map((x) => <option key={x.id} value={x.id}>{x.name} · {leagueLabel(x)} ({x.players.length})</option>)}
                </select>
            </label>
            <span className="text-[11px] font-semibold text-muted-foreground hidden sm:inline">{ts(`modes.${current.mode}`)}{current.formation ? ` · ${current.formation}` : ''}</span>
            <button type="button" onClick={remove} title={t('removeTeam')} className="bb-btn bg-card h-8 w-8 inline-flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
            <AccountTeamsBadge status={account.status} next="/fantacalcio/formazione" />
            {context && roundInfo && (
                <span className="ml-auto text-[12px] font-extrabold">
                    {t('round', {round: roundName(context.round)})}
                    <span className="ml-1 text-[11px] font-bold text-muted-foreground">· {roundInfo.state === 'live' ? t('roundLive') : t('roundNext')}</span>
                </span>
            )}
            <Link href="/fantacalcio/asta" className={cn("bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1.5", !(context && roundInfo) && "ml-auto")}><Settings2 className="w-3.5 h-3.5" aria-hidden="true" />{t('toAuction')}</Link>
        </div>
    );

    if (roster.length === 0) {
        return (
            <div className="flex flex-col gap-3">
                {toolbar}
                <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('emptyRoster', {team: current.name})}</p>
            </div>
        );
    }
    if (!context) {
        return (
            <div className="flex flex-col gap-3">
                {toolbar}
                <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('noMatchday')}</p>
            </div>
        );
    }

    return <LineupBoard key={current.id} current={current} context={context} roster={roster} byId={byId} teamById={new Map(pool.teams.map((tm) => [tm.id, tm]))} toolbar={toolbar} roundInfo={roundInfo} />;
}

/** The advice for one team: forecasts, pins and outs, the formation, the tables; frozen once the round has kicked off. */
function LineupBoard({current, context, roster, byId, teamById, toolbar, roundInfo}: {current: SavedTeam; context: MatchdayContext; roster: AuctionPlayer[]; byId: Map<number, AuctionPlayer>; teamById: Map<number, TeamSummary>; toolbar: React.ReactNode; roundInfo: MatchdayRound | null}) {
    const t = useTranslations('Fantasy.lineup');
    const format = useFormatter();
    const reasonText = useReasonText();
    const allPins = pinsStore.useValue();
    const allOuts = outsStore.useValue();
    const allBenched = benchedStore.useValue();
    const locks = locksStore.useValue();
    const history = historyStore.useValue();
    const [forced, setForced] = useState<FormationKey | null>(null);
    // The substitute being placed by hand: the next tap on a starter is the one who leaves.
    const [picking, setPicking] = useState<number | null>(null);
    // The step-by-step guide: opens by itself the first time the page is seen on this browser, and from the button after.
    const [tour, setTour] = useState(false);
    useEffect(() => {
        try {
            if (!localStorage.getItem(TOUR_KEY)) queueMicrotask(() => setTour(true));
        } catch {
            // No storage: no guide by itself, the button stays.
        }
    }, []);
    const closeTour = () => {
        setTour(false);
        try {
            localStorage.setItem(TOUR_KEY, '1');
        } catch {
            // Shown again next time: no harm.
        }
    };
    // The clock, so the page locks itself at kick-off while open.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(id);
    }, []);
    const rosterIds = new Set(roster.map((p) => p.id));
    // Players marked out by hand: the news is ahead of the data.
    const liveOuts = new Set((allOuts[current.id] ?? []).filter((id) => rosterIds.has(id)));
    const toggleOut = (id: number) => {
        const next = liveOuts.has(id) ? [...liveOuts].filter((x) => x !== id) : [...liveOuts, id];
        outsStore.write({...allOuts, [current.id]: next});
    };
    const liveForecasts = roster.map((p) => forecastPlayer(toMatchdayPlayer(p), contextOf(p, context, liveOuts.has(p.id)), context.fixtures, current.rules, context.calibration));
    // Starters pinned by hand for this team: the lineup is built around them.
    const livePinned = new Set((allPins[current.id] ?? []).filter((id) => rosterIds.has(id)));
    const togglePin = (id: number) => {
        const next = livePinned.has(id) ? [...livePinned].filter((x) => x !== id) : [...livePinned, id];
        pinsStore.write({...allPins, [current.id]: next});
    };
    // Substitutes sent to the bench by hand: someone else took their place.
    const liveBenched = new Set((allBenched[current.id] ?? []).filter((id) => rosterIds.has(id)));
    const unbench = (id: number) => benchedStore.write({...allBenched, [current.id]: [...liveBenched].filter((x) => x !== id)});
    /** `inId` takes the place of `outId`: the first is pinned, the second sent to the bench. With no `outId` the numbers pick who leaves. */
    const swap = (inId: number, outId: number | null) => {
        if (inId === outId) return;
        pinsStore.write({...allPins, [current.id]: [...[...livePinned].filter((x) => x !== outId), ...(livePinned.has(inId) ? [] : [inId])]});
        benchedStore.write({...allBenched, [current.id]: [...[...liveBenched].filter((x) => x !== inId), ...(outId !== null && !liveBenched.has(outId) ? [outId] : [])]});
        setPicking(null);
    };
    const clearPins = () => {
        pinsStore.write({...allPins, [current.id]: []});
        benchedStore.write({...allBenched, [current.id]: []});
        setPicking(null);
    };

    // The deadline: the round's first kick-off. From then on the lineup cannot be changed in any league,
    // so the advice freezes as it stood at the last view before it, and stays until the next round.
    const deadline = roundInfo ? Date.parse(roundInfo.from) : NaN;
    const locked = !!roundInfo && (roundInfo.state === 'live' || roundInfo.state === 'played' || (Number.isFinite(deadline) && now >= deadline));
    const stored = locks[current.id];
    // A snapshot from an older model is not worth keeping: the round is drawn again with the current one.
    const frozen: LineupLock | null = locked && stored && stored.round === context.round && stored.model === LINEUP_MODEL ? stored : null;
    const serialized = JSON.stringify({round: context.round, model: LINEUP_MODEL, deadline: roundInfo?.from ?? '', forecasts: liveForecasts, forced, pinned: [...livePinned], outs: [...liveOuts], benched: [...liveBenched]});
    const fingerprint = hashOf(serialized);
    const hasRound = roundInfo !== null;
    useEffect(() => {
        if (!hasRound) return;
        const known = locks[current.id];
        const valid = known?.round === context.round && known.model === LINEUP_MODEL;
        // A lock of a round now over is kept aside before it is overwritten: the recap reads it back.
        if (known && known.round !== context.round) {
            const kept = history[current.id] ?? [];
            if (!kept.some((l) => l.round === known.round)) historyStore.write({...history, [current.id]: [...kept, known].slice(-HISTORY_ROUNDS)});
        }
        // Frozen: nothing more to write. Open: keep the last view; just kicked off without a view before: freeze now.
        if (locked && valid) return;
        if (valid && known.fingerprint === fingerprint) return;
        const snapshot = JSON.parse(serialized) as Omit<LineupLock, 'fingerprint' | 'savedAt'>;
        locksStore.write({...locks, [current.id]: {...snapshot, fingerprint, savedAt: new Date().toISOString()}});
    }, [hasRound, locked, locks, history, current.id, context.round, fingerprint, serialized]);
    const forecasts = frozen ? (frozen.forecasts as PlayerForecast[]) : liveForecasts;
    const pinned = frozen ? new Set(frozen.pinned) : livePinned;
    const outs = frozen ? new Set(frozen.outs) : liveOuts;
    const benched = frozen ? new Set(frozen.benched ?? []) : liveBenched;
    const forcedNow = frozen ? (frozen.forced as FormationKey | null) : forced;
    const frozenFresh = frozen ? Date.parse(frozen.savedAt) >= Date.parse(frozen.deadline) : false;
    const options = {rules: current.rules, defenceModifier: defenceOption(current), prefer: current.formation as FormationKey | null};
    const advice = recommendLineup(forecasts, {...options, force: forcedNow, pinned, benched});
    // What the pins cost: the same roster left to the numbers alone.
    const free = pinned.size > 0 || benched.size > 0 ? recommendLineup(forecasts, options) : advice;
    // The score of the round begun (or, before the next kicks off, of the last one played): the lineup as it
    // was frozen at that round's lock, scored on the matches over and the ones on the pitch.
    const results = context.results[0] ?? null;
    const pastLock = results && frozen?.round !== results.round ? (history[current.id] ?? []).find((l) => l.round === results.round && l.model === LINEUP_MODEL) ?? null : null;
    const scoredAdvice = results ? (frozen && frozen.round === results.round ? advice : pastLock ? recommendLineup((pastLock.forecasts as PlayerForecast[]).filter((f) => rosterIds.has(f.player.id)), {...options, force: pastLock.forced as FormationKey | null, pinned: new Set(pastLock.pinned), benched: new Set(pastLock.benched ?? [])}) : null) : null;
    const asLineup = (f: PlayerForecast) => ({id: f.player.id, role: f.player.role, teamId: f.player.team.id});
    const score = results && scoredAdvice ? liveScore(scoredAdvice.starters.map(asLineup), scoredAdvice.bench.map(asLineup), results, current.rules, context.calibration, defenceOption(current)) : null;
    const roundMatches = results?.round === context.round ? results.matches : [];
    const pickingPlayer = picking !== null ? byId.get(picking) ?? null : null;
    const pinCost = Math.round((free.total - advice.total) * 10) / 10;
    const rosterTeams = [...new Set(roster.map((p) => p.team.id))];
    const withOfficial = rosterTeams.filter((id) => context.officialTeams.includes(id)).length;
    const fixturesOfRoster = context.fixtures.filter((f) => rosterTeams.includes(f.home.id) || rosterTeams.includes(f.away.id));
    const missingCount = ROLES.reduce((s, r) => s + Math.max(0, (FORMATIONS.find((f) => f.key === advice.formation)?.need[r] ?? 0) - forecasts.filter((f) => f.player.role === r).length), 0);
    const when = (iso: string) => format.dateTime(new Date(iso), {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME});

    return (
        <div className="flex flex-col gap-3">
            {toolbar}
            {tour && <Tour steps={TOUR_STEPS.map((key) => ({target: key, title: t(`tour.steps.${key}.title`), text: t(`tour.steps.${key}.text`)}))} onClose={closeTour} />}
            <div data-tour="status" className="bb-surface px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] font-semibold">
                <span className={cn("inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border-2 border-foreground font-extrabold", frozen ? "bg-amber-200" : "bg-emerald-200")}>
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    {frozen ? t('status.locked') : roundInfo ? t('status.open', {when: when(roundInfo.from)}) : t('status.openNoDate')}
                </span>
                {roundInfo && <span className="text-muted-foreground">{when(roundInfo.from)} → {when(roundInfo.to)}</span>}
                <span className={cn("bb-badge text-[10px] h-5 px-1.5", withOfficial > 0 ? "bg-emerald-200" : "bg-card")}>{t('officialCount', {have: withOfficial, total: rosterTeams.length})}</span>
                <span className="text-muted-foreground ml-auto">{frozen ? t('frozenAt', {when: when(frozen.savedAt)}) : t('updated', {when: format.dateTime(new Date(context.generatedAt), {hour: '2-digit', minute: '2-digit', timeZone: ROME})})}</span>
                <button type="button" onClick={() => setTour(true)} className="bb-btn bg-card px-2.5 h-7 text-[11px] font-extrabold inline-flex items-center gap-1.5" title={t('tour.open')}><BookOpen className="w-3.5 h-3.5" aria-hidden="true" />{t('tour.button')}</button>
            </div>
            {frozen && (
                <div className="bb-surface px-3 py-2 flex items-start gap-2 text-[12px] font-semibold bg-amber-100">
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span><span className="font-extrabold">{t('locked.title')}</span> {frozenFresh ? t('locked.fresh', {deadline: when(frozen.deadline)}) : t('locked.text', {deadline: when(frozen.deadline), savedAt: when(frozen.savedAt)})}</span>
                </div>
            )}


            <div className="grid gap-3 grid-cols-1 xl:grid-cols-3 items-start">
                <div className="xl:col-span-2 flex flex-col gap-3 min-w-0">
                    {score && results && (
                        <div data-tour="liveScore">
                            <AutoRefresh seconds={60} enabled={score.state === 'live'} />
                            <LiveScorePanel score={score} byId={byId} fixtures={results.round === context.round ? context.fixtures : []} official={results.official} roundLabel={roundName(results.round)} />
                        </div>
                    )}
                    {fixturesOfRoster.length > 0 && (
                        <ul data-tour="fixtures" aria-label={t('fixturesTitle')} className="bb-surface px-2 py-1.5 flex gap-1.5 overflow-x-auto [scrollbar-width:thin]">
                            {fixturesOfRoster.map((f) => {
                                const mine = roster.filter((p) => p.team.id === f.home.id || p.team.id === f.away.id);
                                const official = context.officialTeams.includes(f.home.id) || context.officialTeams.includes(f.away.id);
                                const starting = mine.filter((p) => advice.starters.some((s) => s.player.id === p.id)).length;
                                const match = roundMatches.find((m) => m.home.id === f.home.id && m.away.id === f.away.id);
                                const played = match && (match.finished || match.live) ? match : null;
                                return (
                                    <li key={f.id} title={`${when(f.startingAt)}${f.prediction ? ` · ${Math.round(f.prediction.home)}% · ${Math.round(f.prediction.draw)}% · ${Math.round(f.prediction.away)}% · xG ${f.prediction.lambdaHome.toFixed(1)}-${f.prediction.lambdaAway.toFixed(1)}` : ''}\n${mine.map((p) => p.name).join(', ')}`} className="shrink-0 inline-flex flex-col gap-0.5 px-2 py-1 rounded-md border border-foreground/40 bg-card text-[11px] font-bold leading-tight">
                                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                            <span className={cn(rosterTeams.includes(f.home.id) && "underline decoration-accent decoration-2 underline-offset-2")}>{f.home.name}</span>
                                            <span className="text-muted-foreground">–</span>
                                            <span className={cn(rosterTeams.includes(f.away.id) && "underline decoration-accent decoration-2 underline-offset-2")}>{f.away.name}</span>
                                            {played?.score && <span className="font-mono tabular-nums">{played.score[0]}-{played.score[1]}</span>}
                                            {played?.live && <span className="inline-flex items-center gap-1 font-mono text-[10px] text-red-700"><span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />{played.minute !== null && played.minute !== undefined ? `${played.minute}'` : t('live')}</span>}
                                            {played?.finished && <span className="bb-badge bg-card text-[9px] h-4 px-1">{t('played')}</span>}
                                            {official && !played && <span className="bb-badge bg-emerald-200 text-[9px] h-4 px-1">{t('officialBadge')}</span>}
                                        </span>
                                        <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{when(f.startingAt)} · {t('fixtureMine', {count: mine.length, starting})}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_280px] gap-3 items-stretch">
                    <div className="flex flex-col gap-3 min-w-0">
                    <FantasyPitch starters={advice.starters} formation={advice.formation} byId={byId} pinned={pinned} picking={frozen ? null : picking} onSwap={swap} onPlace={(id) => swap(id, null)} />
                    {missingCount > 0 && <p className="bb-surface px-3 py-2 text-[12px] font-semibold text-red-700">{t('short', {count: missingCount})}</p>}
                    {pickingPlayer && !frozen ? (
                        <div className="bb-surface bg-accent/30 px-3 py-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold">
                            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span className="font-extrabold">{t('pickingBanner', {name: pickingPlayer.name})}</span>
                            <span className="ml-auto flex items-center gap-1.5">
                                <button type="button" onClick={() => swap(pickingPlayer.id, null)} className="bb-btn bg-foreground text-background h-7 px-2.5 text-[11px] font-extrabold inline-flex items-center gap-1"><Sparkles className="w-3 h-3" aria-hidden="true" />{t('placeBest')}</button>
                                <button type="button" onClick={() => setPicking(null)} className="bb-btn bg-card h-7 px-2.5 text-[11px] font-extrabold">{t('placeCancel')}</button>
                            </span>
                        </div>
                    ) : (
                    <div data-tour="pins" className="bb-surface px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold">
                        <Pin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {outs.size > 0 && <span className="text-red-700 font-extrabold">{t('outsCount', {count: outs.size})}</span>}
                        {pinned.size === 0 && benched.size === 0 ? (
                            <span className="text-muted-foreground">{t('pinsHint')}</span>
                        ) : (
                            <>
                                {pinned.size > 0 && <span className="font-extrabold">{t('pinsCount', {count: pinned.size})}</span>}
                                {benched.size > 0 && <span className="font-extrabold text-red-700">{t('benchedCount', {count: benched.size})}</span>}
                                <span className={cn(pinCost > 0 ? "text-red-700" : "text-muted-foreground")}>{pinCost > 0 ? t('pinsCost', {cost: pinCost.toFixed(1), formation: free.formation}) : t('pinsFree')}</span>
                                {!advice.formations[0].feasible && <span className="text-red-700">{t('pinsNoRoom')}</span>}
                                {!frozen && <button type="button" onClick={clearPins} className="bb-btn bg-card h-6 px-2 text-[11px] font-extrabold ml-auto">{t('clearPins')}</button>}
                            </>
                        )}
                    </div>
                    )}
                    </div>
                    <BenchStrip bench={advice.bench} slots={advice.slots} byId={byId} pinned={pinned} benched={benched} outs={outs} picking={frozen ? null : picking} locked={!!frozen} onPlace={(id) => setPicking(picking === id ? null : id)} onUnbench={unbench} />
                    </div>
                    <div data-tour="starters"><Panel title={t('startersTitle', {formation: advice.formation, total: advice.total.toFixed(1)})}>
                        <ul className="md:hidden flex flex-col">
                            {advice.starters.map((f) => <ForecastCard key={f.player.id} f={f} slot={advice.slots.get(f.player.id)} index={null} byId={byId} teamById={teamById} reasonText={reasonText} pinned={pinned.has(f.player.id)} onPin={() => togglePin(f.player.id)} out={outs.has(f.player.id)} onOut={() => toggleOut(f.player.id)} locked={!!frozen} />)}
                        </ul>
                        <div className="overflow-x-auto hidden md:block">
                            <table className="w-full text-[12px]">
                                <Head />
                                <tbody>
                                    {advice.starters.map((f, i) => <ForecastRow key={f.player.id} f={f} slot={advice.slots.get(f.player.id)} index={null} byId={byId} teamById={teamById} reasonText={reasonText} stripe={i % 2 === 1} pinned={pinned.has(f.player.id)} onPin={() => togglePin(f.player.id)} out={outs.has(f.player.id)} onOut={() => toggleOut(f.player.id)} locked={!!frozen} />)}
                                </tbody>
                            </table>
                        </div>
                    </Panel></div>
                    <Panel title={<span className="inline-flex items-center gap-1.5">{t('benchTitle', {count: advice.bench.length})}<Help text={`${t('benchHint')}\n${t('dragHint')}`} /></span>} action={<span className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><ArrowLeftRight className="w-3 h-3" aria-hidden="true" />{t('dragShort')}</span>}>
                        <ul className="md:hidden flex flex-col">
                            {advice.bench.map((f, i) => <ForecastCard key={f.player.id} f={f} slot={advice.slots.get(f.player.id)} index={i + 1} byId={byId} teamById={teamById} reasonText={reasonText} muted={f.plays < 0.2} pinned={pinned.has(f.player.id)} onPin={() => togglePin(f.player.id)} out={outs.has(f.player.id)} onOut={() => toggleOut(f.player.id)} locked={!!frozen} swap={{benched: benched.has(f.player.id), onUnbench: () => unbench(f.player.id), onPlace: () => setPicking(picking === f.player.id ? null : f.player.id), picking: picking === f.player.id}} />)}
                        </ul>
                        <div className="overflow-x-auto hidden md:block">
                            <table className="w-full text-[12px]">
                                <Head />
                                <tbody>
                                    {advice.bench.map((f, i) => <ForecastRow key={f.player.id} f={f} slot={advice.slots.get(f.player.id)} index={i + 1} byId={byId} teamById={teamById} reasonText={reasonText} muted={f.plays < 0.2} stripe={i % 2 === 1} pinned={pinned.has(f.player.id)} onPin={() => togglePin(f.player.id)} out={outs.has(f.player.id)} onOut={() => toggleOut(f.player.id)} locked={!!frozen} swap={{benched: benched.has(f.player.id), onUnbench: () => unbench(f.player.id), onPlace: () => setPicking(picking === f.player.id ? null : f.player.id), picking: picking === f.player.id}} />)}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </div>

                <div className="flex flex-col gap-3 min-w-0">
                    <div data-tour="formations"><Panel title={<span className="inline-flex items-center gap-1.5">{t('formationsTitle')}<Help text={t('formationsHint')} /></span>}>
                        <ul className="flex flex-col divide-y divide-muted">
                            {advice.formations.map((f, i) => (
                                <li key={f.key}>
                                    <button type="button" onClick={() => setForced(forcedNow === f.key ? null : f.key)} aria-pressed={f.key === advice.formation} disabled={!!frozen || (!f.feasible && advice.formations[0].feasible)} title={frozen ? t('lockedNoChange') : !f.feasible ? t('noRoom') : undefined} className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent", f.key === advice.formation && "bg-accent/30")}>
                                        <span className="font-mono text-[13px] font-extrabold w-12">{f.key}</span>
                                        <span className="font-mono text-[12px] font-bold tabular-nums">{f.total.toFixed(1)}</span>
                                        {!f.feasible && <span className="bb-badge bg-red-200 text-[9px] h-4 px-1">{t('noRoomBadge')}</span>}
                                        {i === 0 && f.key === advice.formation && forcedNow === null && <span className="bb-badge bg-accent text-[9px] h-4 px-1">{t('best')}</span>}
                                        {forcedNow === f.key && <span className="bb-badge bg-foreground text-background text-[9px] h-4 px-1">{t('forced')}</span>}
                                        {current.formation === f.key && <span className="bb-badge bg-card text-[9px] h-4 px-1">{t('leagueFormation')}</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>

                    </Panel></div>
                    <details data-tour="how" className="bb-surface overflow-hidden group">
                        <summary className="flex items-center justify-between gap-2 px-3 h-9 bg-card cursor-pointer list-none text-[13px] font-extrabold uppercase tracking-wide">
                            {t('howTitle')}
                            <span className="text-[11px] font-bold text-muted-foreground normal-case tracking-normal group-open:hidden">{t('howOpen')}</span>
                        </summary>
                        <ul className="px-3 py-2 flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground list-disc pl-7 border-t-2 border-foreground">
                            <li>{t('how1')}</li>
                            <li>{t('how2')}</li>
                            <li>{t('how3')}</li>
                            <li>{t('how4')}</li>
                            {defenceOption(current) !== false && <li>{t('how5')}</li>}
                            <li>{t('how6')}</li>
                            <li>{t('how7')}</li>
                            <li>{t('how8')}</li>
                        </ul>
                    </details>
                </div>
            </div>
        </div>
    );
}
