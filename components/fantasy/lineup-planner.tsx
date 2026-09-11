'use client';

import {Pin, PinOff, Settings2, Trash2} from "lucide-react";
import {useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link, useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {TeamCrest} from "@/components/football/team-crest";
import {RoleBadge, ROLE_CLASS} from "./role-badge";
import {DEFAULT_RULES, type AuctionConfig} from "@/lib/fantasy/config";
import type {AuctionPlayer, AuctionPool} from "@/lib/fantasy/data";
import {forecastPlayer, recommendLineup, type ForecastReason, type MatchdayPlayer, type PlayerContext, type PlayerForecast} from "@/lib/fantasy/matchday";
import type {MatchdayContext} from "@/lib/fantasy/matchday-data";
import {fantaAvgFor, type FantaRole} from "@/lib/fantasy/scores";
import {pinsStore, teamsStore, useHydrated} from "@/lib/fantasy/store";
import {defenceOption, FORMATIONS, type FormationKey} from "@/lib/fantasy/strategies";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const ROME = 'Europe/Rome';

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
function contextOf(p: AuctionPlayer, ctx: MatchdayContext): PlayerContext | null {
    const known = ctx.players[p.id];
    const official = ctx.official[p.id] ?? (ctx.officialTeams.includes(p.team.id) ? 'out' : null);
    if (!known && !official) return null;
    return {teamId: known?.teamId ?? p.team.id, recent: known?.recent ?? [], sidelined: known?.sidelined ?? null, official};
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** "Regular Season - 10" reads as 10; anything else as it is. */
const roundName = (round: string) => (/^Regular Season - \d+$/.test(round) ? round.slice('Regular Season - '.length) : round);

function useReasonText() {
    const t = useTranslations('Fantasy.lineup.reasons');
    return (r: ForecastReason): string => {
        switch (r.kind) {
            case 'official': return t(`official.${r.status}`);
            case 'sidelined': return t(r.category === 'injury' ? 'injury' : r.category === 'suspension' ? 'suspension' : 'absent', {detail: r.description ? ` · ${r.description}` : '', long: r.longTerm ? t('longTerm') : ''});
            case 'doubtful': return t('doubtful', {detail: r.description ? ` · ${r.description}` : ''});
            case 'noMatch': return t('noMatch');
            case 'usage': return t('usage', {started: r.started, came: r.came, total: r.total});
            case 'noUsage': return t('noUsage');
            case 'match': return t('match', {where: r.home ? t('home') : t('away'), opponent: r.opponent, win: Math.round(r.win), lambdaFor: r.lambdaFor.toFixed(1), lambdaAgainst: r.lambdaAgainst.toFixed(1)});
            case 'attack': return t(r.factor > 1 ? 'attackUp' : 'attackDown', {pct: Math.round(Math.abs(r.factor - 1) * 100)});
            case 'cleanSheet': return t('cleanSheet', {pct: r.pct});
            case 'penalty': return t('penalty');
        }
    };
}

/** Tone of a chance: sure, likely, doubtful, out. */
function chanceClass(plays: number): string {
    if (plays >= 0.8) return "bg-emerald-200";
    if (plays >= 0.5) return "bg-amber-200";
    if (plays >= 0.2) return "bg-orange-200";
    return "bg-red-200";
}

function PitchDot({f, byId, pinned}: {f: PlayerForecast; byId: Map<number, AuctionPlayer>; pinned: boolean}) {
    const p = byId.get(f.player.id);
    const surname = f.player.name.split(' ').slice(-1)[0] ?? f.player.name;
    return (
        <Link href={`/players/${f.player.slug}`} target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center gap-0.5 min-w-0 w-[64px] md:w-[80px]">
            <span className="relative">
                <span className={cn("inline-flex w-9 h-9 md:w-10 md:h-10 items-center justify-center rounded-full border-[2.5px] border-foreground bg-card group-hover:ring-2 ring-accent overflow-hidden")}>
                    {p ? <TeamCrest team={p.team} size={26} /> : <RoleBadge role={f.player.role} />}
                </span>
                <span className={cn("absolute -top-1.5 -right-3 font-mono text-[9px] font-extrabold tabular-nums px-1 rounded border border-foreground leading-[14px] text-foreground", chanceClass(f.plays))}>{pct(f.plays)}</span>
                {pinned && <span className="absolute -top-1.5 -left-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-foreground bg-foreground text-background"><Pin className="w-2.5 h-2.5" aria-hidden="true" /></span>}
            </span>
            <span className="text-[10px] md:text-[11px] font-bold leading-tight text-center truncate max-w-full text-background [text-shadow:0_1px_2px_rgba(0,0,0,.6)] group-hover:underline decoration-accent decoration-2 underline-offset-2">{surname}</span>
            <span className="font-mono text-[10px] font-extrabold tabular-nums leading-none text-background [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">{f.points.toFixed(1)}</span>
        </Link>
    );
}

/** The eleven on a pitch: attackers at the top, the keeper at the bottom. */
function FantasyPitch({starters, formation, byId, pinned}: {starters: PlayerForecast[]; formation: FormationKey; byId: Map<number, AuctionPlayer>; pinned: ReadonlySet<number>}) {
    const rows = [...ROLES].reverse().map((role) => starters.filter((f) => f.player.role === role));
    return (
        <div className="relative rounded-xl border-[2.5px] border-foreground overflow-hidden bg-[#3f8f3a] text-background">
            <div className="absolute inset-2 border-2 border-white/60 rounded-sm pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 top-2 w-[44%] h-[13%] -ml-[22%] border-2 border-t-0 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 bottom-2 w-[44%] h-[13%] -ml-[22%] border-2 border-b-0 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_10%,rgba(255,255,255,0.05)_10%,rgba(255,255,255,0.05)_20%)] pointer-events-none" aria-hidden="true" />
            <div className="relative flex flex-col gap-2 md:gap-3 px-2 py-3">
                <div className="flex items-center justify-end px-1 text-[11px] font-extrabold uppercase tracking-wide"><span className="font-mono">{formation}</span></div>
                {rows.map((line, i) => (
                    <div key={i} className="flex justify-around">{line.map((f) => <PitchDot key={f.player.id} f={f} byId={byId} pinned={pinned.has(f.player.id)} />)}</div>
                ))}
            </div>
        </div>
    );
}

function ForecastRow({f, index, byId, reasonText, muted = false, pinned, onPin}: {f: PlayerForecast; index: number | null; byId: Map<number, AuctionPlayer>; reasonText: (r: ForecastReason) => string; muted?: boolean; pinned: boolean; onPin: () => void}) {
    const t = useTranslations('Fantasy.lineup');
    const format = useFormatter();
    const p = byId.get(f.player.id);
    const fixture = f.fixture;
    const kickoff = fixture ? format.dateTime(new Date(fixture.startingAt), {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME}) : null;
    const opponent = p && fixture ? {id: f.opponent!.id, name: f.opponent!.name, shortCode: null, logoUrl: null} : null;
    const state = fixture ? (fixture.state === 'finished' ? t('played') : ['live', 'half_time', 'extra_time', 'penalties'].includes(fixture.state) ? t('live') : fixture.state === 'postponed' || fixture.state === 'cancelled' ? t('postponed') : null) : null;
    return (
        <tr className={cn("border-t border-muted align-top", muted && !pinned && "opacity-70", pinned && "bg-accent/20")}>
            <td className="px-1 py-1.5">
                <button type="button" onClick={onPin} aria-pressed={pinned} title={pinned ? t('unpin') : t('pin')} className={cn("bb-btn h-6 w-6 inline-flex items-center justify-center", pinned ? "bg-foreground text-background" : "bg-card")}>
                    {pinned ? <PinOff className="w-3 h-3" aria-hidden="true" /> : <Pin className="w-3 h-3" aria-hidden="true" />}
                </button>
            </td>
            {index !== null && <td className="px-2 py-1.5 font-mono text-[11px] font-extrabold tabular-nums text-muted-foreground">{index}</td>}
            <td className="px-1 py-1.5"><RoleBadge role={f.player.role} /></td>
            <td className="px-2 py-1.5 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                    {p && <TeamCrest team={p.team} size={18} />}
                    <Link href={`/players/${f.player.slug}`} target="_blank" rel="noopener noreferrer" className="font-extrabold text-[13px] truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{f.player.name}</Link>
                    {f.player.penaltyTaker && f.player.role !== 'P' && <span className="bb-badge bg-accent text-[9px] h-4 px-1" title={t('reasons.penalty')}>R</span>}
                </span>
                <span className="block text-[10px] font-semibold text-muted-foreground leading-snug">{f.reasons.map(reasonText).join(' · ')}</span>
            </td>
            <td className="px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap">
                {fixture && opponent ? (
                    <span className="flex flex-col">
                        <span className="font-extrabold">{f.home ? t('vsHome', {team: opponent.name}) : t('vsAway', {team: opponent.name})}</span>
                        <span className="text-muted-foreground">{kickoff}{state && <span className="ml-1 uppercase">· {state}</span>}</span>
                    </span>
                ) : (
                    <span className="text-muted-foreground">{t('noFixture')}</span>
                )}
            </td>
            <td className="px-2 py-1.5 text-right"><span className={cn("bb-badge font-mono text-[11px] tabular-nums h-5 px-1.5", chanceClass(f.plays))}>{pct(f.plays)}</span></td>
            <td className="px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums">{f.rating.toFixed(2)}</td>
            <td className="px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums">{f.points.toFixed(2)}</td>
            <td className="px-2 py-1.5 text-right font-mono text-[13px] font-extrabold tabular-nums">{f.value.toFixed(2)}</td>
        </tr>
    );
}

function Head({withIndex}: {withIndex: boolean}) {
    const t = useTranslations('Fantasy.lineup');
    const th = "px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground";
    return (
        <thead className="bg-card">
            <tr>
                <th className={cn(th, "px-1")} aria-label={t('colPin')} />
                {withIndex && <th className={cn(th, "text-left")}>#</th>}
                <th className={cn(th, "px-1")} aria-label={t('colRole')} />
                <th className={cn(th, "text-left")}>{t('colPlayer')}</th>
                <th className={cn(th, "text-left")}>{t('colMatch')}</th>
                <th className={cn(th, "text-right")} title={t('colPlaysHint')}>{t('colPlays')}</th>
                <th className={cn(th, "text-right")} title={t('colRatingHint')}>{t('colRating')}</th>
                <th className={cn(th, "text-right")} title={t('colPointsHint')}>{t('colPoints')}</th>
                <th className={cn(th, "text-right")} title={t('colValueHint')}>{t('colValue')}</th>
            </tr>
        </thead>
    );
}

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
    const format = useFormatter();
    const reasonText = useReasonText();
    const router = useRouter();
    const hydrated = useHydrated();
    const saved = teamsStore.useValue();
    const allPins = pinsStore.useValue();
    const [forced, setForced] = useState<FormationKey | null>(null);

    if (!hydrated) return <p className="text-sm font-semibold text-muted-foreground">…</p>;
    const teams = [...saved.teams].sort((a, b) => a.leagueName.localeCompare(b.leagueName) || a.name.localeCompare(b.name));
    const current = teams.find((x) => x.id === saved.current) ?? teams[0];
    if (!current) {
        return (
            <Panel title={t('title')}>
                <div className="px-3 py-3 flex flex-col gap-3">
                    <p className="text-[13px] font-semibold">{t('noTeams')}</p>
                    <Link href="/fantacalcio/asta" className="bb-btn bg-accent px-4 h-10 inline-flex items-center self-start text-[13px] font-extrabold">{t('goSetup')}</Link>
                </div>
            </Panel>
        );
    }
    if (pool && pool.league !== current.league) {
        router.replace(`/fantacalcio/formazione?league=${current.league}`);
        return <p className="text-sm font-semibold text-muted-foreground">…</p>;
    }
    if (!pool) return <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('noPool')}</p>;

    const players = leaguePlayers(pool, current);
    const byId = new Map(players.map((p) => [p.id, p]));
    const roster = current.players.map((id) => byId.get(id)).filter((p): p is AuctionPlayer => !!p);
    const rosterIds = new Set(roster.map((p) => p.id));
    const roundInfo = context?.rounds.find((r) => r.round === context.round) ?? null;
    const leagueLabel = (x: typeof current) => x.leagueName || ts(`leagues.${x.league}`);
    const choose = (id: string) => {
        teamsStore.write({...saved, current: id});
        setForced(null);
    };
    const remove = () => {
        if (!window.confirm(t('removeConfirm', {team: current.name, league: leagueLabel(current)}))) return;
        teamsStore.write({teams: saved.teams.filter((x) => x.id !== current.id), current: null});
    };

    const toolbar = (
        <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-bold min-w-0">
                <span className="text-muted-foreground">{t('teamLabel')}</span>
                <select value={current.id} onChange={(e) => choose(e.target.value)} className="bb-input h-8 px-2 text-[12px] font-extrabold max-w-[260px]">
                    {teams.map((x) => <option key={x.id} value={x.id}>{x.name} · {leagueLabel(x)} ({x.players.length})</option>)}
                </select>
            </label>
            <span className="text-[11px] font-semibold text-muted-foreground hidden sm:inline">{ts(`modes.${current.mode}`)}{current.formation ? ` · ${current.formation}` : ''}</span>
            <button type="button" onClick={remove} title={t('removeTeam')} className="bb-btn bg-card h-8 w-8 inline-flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></button>
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

    const forecasts = roster.map((p) => forecastPlayer(toMatchdayPlayer(p), contextOf(p, context), context.fixtures, current.rules));
    // Starters pinned by hand for this team: the lineup is built around them.
    const pinned = new Set((allPins[current.id] ?? []).filter((id) => rosterIds.has(id)));
    const togglePin = (id: number) => {
        const next = pinned.has(id) ? [...pinned].filter((x) => x !== id) : [...pinned, id];
        pinsStore.write({...allPins, [current.id]: next});
    };
    const clearPins = () => pinsStore.write({...allPins, [current.id]: []});
    const options = {rules: current.rules, defenceModifier: defenceOption(current), prefer: current.formation as FormationKey | null};
    const advice = recommendLineup(forecasts, {...options, force: forced, pinned});
    // What the pins cost: the same roster left to the numbers alone.
    const free = pinned.size > 0 ? recommendLineup(forecasts, options) : advice;
    const pinCost = Math.round((free.total - advice.total) * 10) / 10;
    const rosterTeams = [...new Set(roster.map((p) => p.team.id))];
    const withOfficial = rosterTeams.filter((id) => context.officialTeams.includes(id)).length;
    const fixturesOfRoster = context.fixtures.filter((f) => rosterTeams.includes(f.home.id) || rosterTeams.includes(f.away.id));
    const missingCount = ROLES.reduce((s, r) => s + Math.max(0, (FORMATIONS.find((f) => f.key === advice.formation)?.need[r] ?? 0) - forecasts.filter((f) => f.player.role === r).length), 0);
    const when = (iso: string) => format.dateTime(new Date(iso), {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME});

    return (
        <div className="flex flex-col gap-3">
            {toolbar}
            <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold">
                {roundInfo && <span className="font-extrabold">{when(roundInfo.from)} → {when(roundInfo.to)}</span>}
                <span className={cn("bb-badge text-[10px] h-5 px-1.5", withOfficial > 0 ? "bg-emerald-200" : "bg-card")}>{t('officialCount', {have: withOfficial, total: rosterTeams.length})}</span>
                <span className="text-muted-foreground">{t('updated', {when: format.dateTime(new Date(context.generatedAt), {hour: '2-digit', minute: '2-digit', timeZone: ROME})})}</span>
            </div>

            <div className="grid gap-3 grid-cols-1 lg:grid-cols-3 items-start">
                <div className="lg:col-span-2 flex flex-col gap-3 min-w-0">
                    <FantasyPitch starters={advice.starters} formation={advice.formation} byId={byId} pinned={pinned} />
                    {missingCount > 0 && <p className="bb-surface px-3 py-2 text-[12px] font-semibold text-red-700">{t('short', {count: missingCount})}</p>}
                    <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold">
                        <Pin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {pinned.size === 0 ? (
                            <span className="text-muted-foreground">{t('pinsHint')}</span>
                        ) : (
                            <>
                                <span className="font-extrabold">{t('pinsCount', {count: pinned.size})}</span>
                                <span className={cn(pinCost > 0 ? "text-red-700" : "text-muted-foreground")}>{pinCost > 0 ? t('pinsCost', {cost: pinCost.toFixed(1), formation: free.formation}) : t('pinsFree')}</span>
                                {!advice.formations[0].feasible && <span className="text-red-700">{t('pinsNoRoom')}</span>}
                                <button type="button" onClick={clearPins} className="bb-btn bg-card h-6 px-2 text-[11px] font-extrabold ml-auto">{t('clearPins')}</button>
                            </>
                        )}
                    </div>
                    <Panel title={t('startersTitle', {formation: advice.formation, total: advice.total.toFixed(1)})}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <Head withIndex={false} />
                                <tbody>
                                    {advice.starters.map((f) => <ForecastRow key={f.player.id} f={f} index={null} byId={byId} reasonText={reasonText} pinned={pinned.has(f.player.id)} onPin={() => togglePin(f.player.id)} />)}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                    <Panel title={t('benchTitle', {count: advice.bench.length})}>
                        <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-muted">{t('benchHint')}</p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <Head withIndex />
                                <tbody>
                                    {advice.bench.map((f, i) => <ForecastRow key={f.player.id} f={f} index={i + 1} byId={byId} reasonText={reasonText} muted={f.plays < 0.2} pinned={pinned.has(f.player.id)} onPin={() => togglePin(f.player.id)} />)}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </div>

                <div className="flex flex-col gap-3 min-w-0">
                    <Panel title={t('formationsTitle')}>
                        <ul className="flex flex-col divide-y divide-muted">
                            {advice.formations.map((f, i) => (
                                <li key={f.key}>
                                    <button type="button" onClick={() => setForced(forced === f.key ? null : f.key)} aria-pressed={f.key === advice.formation} disabled={!f.feasible && advice.formations[0].feasible} title={!f.feasible ? t('noRoom') : undefined} className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent", f.key === advice.formation && "bg-accent/30")}>
                                        <span className="font-mono text-[13px] font-extrabold w-12">{f.key}</span>
                                        <span className="font-mono text-[12px] font-bold tabular-nums">{f.total.toFixed(1)}</span>
                                        {!f.feasible && <span className="bb-badge bg-red-200 text-[9px] h-4 px-1">{t('noRoomBadge')}</span>}
                                        {i === 0 && f.key === advice.formation && forced === null && <span className="bb-badge bg-accent text-[9px] h-4 px-1">{t('best')}</span>}
                                        {forced === f.key && <span className="bb-badge bg-foreground text-background text-[9px] h-4 px-1">{t('forced')}</span>}
                                        {current.formation === f.key && <span className="bb-badge bg-card text-[9px] h-4 px-1">{t('leagueFormation')}</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('formationsHint')}</p>
                    </Panel>
                    <Panel title={t('fixturesTitle')}>
                        <ul className="flex flex-col divide-y divide-muted">
                            {fixturesOfRoster.map((f) => {
                                const mine = roster.filter((p) => p.team.id === f.home.id || p.team.id === f.away.id);
                                const official = context.officialTeams.includes(f.home.id) || context.officialTeams.includes(f.away.id);
                                return (
                                    <li key={f.id} className="px-3 py-1.5 flex flex-col gap-0.5">
                                        <span className="flex items-center gap-2 text-[12px] font-extrabold">
                                            <span className={cn("truncate", rosterTeams.includes(f.home.id) && "underline decoration-accent decoration-2 underline-offset-2")}>{f.home.name}</span>
                                            <span className="text-muted-foreground">–</span>
                                            <span className={cn("truncate", rosterTeams.includes(f.away.id) && "underline decoration-accent decoration-2 underline-offset-2")}>{f.away.name}</span>
                                            {official && <span className="bb-badge bg-emerald-200 text-[9px] h-4 px-1 ml-auto shrink-0">{t('officialBadge')}</span>}
                                        </span>
                                        <span className="text-[10px] font-semibold text-muted-foreground">
                                            {when(f.startingAt)}
                                            {f.prediction && ` · ${Math.round(f.prediction.home)}% · ${Math.round(f.prediction.draw)}% · ${Math.round(f.prediction.away)}% · xG ${f.prediction.lambdaHome.toFixed(1)}-${f.prediction.lambdaAway.toFixed(1)}`}
                                        </span>
                                        <span className="flex flex-wrap gap-1">
                                            {mine.map((p) => <span key={p.id} className={cn("inline-flex items-center gap-1 h-5 px-1.5 rounded border border-foreground/40 text-[10px] font-bold", rosterIds.has(p.id) && advice.starters.some((s) => s.player.id === p.id) ? ROLE_CLASS[p.role] : "bg-card")}>{p.name}</span>)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </Panel>
                    <Panel title={t('howTitle')}>
                        <ul className="px-3 py-2 flex flex-col gap-1.5 text-[11px] font-semibold text-muted-foreground list-disc pl-7">
                            <li>{t('how1')}</li>
                            <li>{t('how2')}</li>
                            <li>{t('how3')}</li>
                            <li>{t('how4')}</li>
                            {defenceOption(current) !== false && <li>{t('how5')}</li>}
                            <li>{t('how6')}</li>
                        </ul>
                    </Panel>
                </div>
            </div>
        </div>
    );
}

