'use client';

import {ArrowLeftRight, Ban, HelpCircle, Lock, Pin, PinOff, RotateCcw, Settings2, Sparkles, Trash2, X} from "lucide-react";
import {useEffect, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link, useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {TeamCrest} from "@/components/football/team-crest";
import {RoleBadge} from "./role-badge";
import {DEFAULT_RULES, type AuctionConfig} from "@/lib/fantasy/config";
import type {AuctionPlayer, AuctionPool} from "@/lib/fantasy/data";
import type {TeamSummary} from "@/lib/football/types";
import {forecastPlayer, recommendLineup, type ForecastReason, type MatchdayPlayer, type PlayerContext, type PlayerForecast} from "@/lib/fantasy/matchday";
import type {MatchdayContext} from "@/lib/fantasy/matchday-data";
import {fantaAvgFor, type FantaRole} from "@/lib/fantasy/scores";
import {benchedStore, HISTORY_ROUNDS, historyStore, locksStore, outsStore, pinsStore, teamsStore, useHydrated, type LineupLock} from "@/lib/fantasy/store";
import type {MatchdayRound} from "@/lib/fantasy/matchday-data";
import type {SavedTeam} from "@/lib/fantasy/config";
import {defenceOption, FORMATIONS, type FormationKey} from "@/lib/fantasy/strategies";
import {hashOf} from "@/lib/fantasy/hash";
import {keepSpots, sameSpots, type Spot} from "@/lib/fantasy/spots";
import {AccountTeamsBadge, useAccountTeams} from "./account-teams";
import {RoundRecap} from "./round-recap";
import {RecapHistory} from "./recap-history";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const ROME = 'Europe/Rome';
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
            case 'form': return t('form', {own: r.own, opp: r.opp, of: r.of});
            case 'playerForm': return t('playerForm', {avg: r.avg.toFixed(2), matches: r.matches, base: r.base.toFixed(2)});
            case 'bonusForm': return t('bonusForm', {goals: r.goals, assists: r.assists, matches: r.matches});
            case 'cards': return t(r.factor > 1 ? 'cardsUp' : 'cardsDown', {pct: Math.round(Math.abs(r.factor - 1) * 100)});
            case 'manual': return t('manual');
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

/** What travels with a dragged player: his id, as plain text so the browser does the rest. */
const DRAG_TYPE = 'text/plain';
function draggedId(e: React.DragEvent): number | null {
    const id = Number(e.dataTransfer.getData(DRAG_TYPE));
    return Number.isInteger(id) && id > 0 ? id : null;
}

function PitchDot({f, byId, pinned, picking, onReceive}: {f: PlayerForecast; byId: Map<number, AuctionPlayer>; pinned: boolean; /** A substitute is being placed by hand: this starter can be the one who leaves. */ picking: boolean; /** A substitute (by id) takes this starter's place; null while picking means the one being placed. */ onReceive: (inId: number | null) => void}) {
    const t = useTranslations('Fantasy.lineup');
    const p = byId.get(f.player.id);
    const [over, setOver] = useState(false);
    const surname = f.player.name.split(' ').slice(-1)[0] ?? f.player.name;
    const body = (
        <>
            <span className="relative">
                <span className={cn("inline-flex w-9 h-9 md:w-10 md:h-10 items-center justify-center rounded-full border-[2.5px] border-foreground bg-card group-hover:ring-2 ring-accent overflow-hidden transition-transform", (over || picking) && "ring-4 ring-accent", over && "scale-110")}>
                    {p ? <TeamCrest team={p.team} size={26} /> : <RoleBadge role={f.player.role} />}
                </span>
                <span className={cn("absolute -top-1.5 -right-3 font-mono text-[9px] font-extrabold tabular-nums px-1 rounded border border-foreground leading-[14px] text-foreground", chanceClass(f.plays))}>{pct(f.plays)}</span>
                {pinned && <span className="absolute -top-1.5 -left-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-foreground bg-foreground text-background"><Pin className="w-2.5 h-2.5" aria-hidden="true" /></span>}
                {picking && <span className="absolute -bottom-1 -right-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-foreground bg-accent text-foreground"><ArrowLeftRight className="w-2.5 h-2.5" aria-hidden="true" /></span>}
            </span>
            <span className="text-[10px] md:text-[11px] font-bold leading-tight text-center truncate max-w-full text-background [text-shadow:0_1px_2px_rgba(0,0,0,.6)] group-hover:underline decoration-accent decoration-2 underline-offset-2">{surname}</span>
            <span className="font-mono text-[10px] font-extrabold tabular-nums leading-none text-background [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">{f.points.toFixed(1)}</span>
        </>
    );
    const cls = "group flex flex-col items-center gap-0.5 min-w-0 w-[64px] md:w-[80px]";
    const drop = {
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(false); const id = draggedId(e); if (id !== null && id !== f.player.id) onReceive(id); },
    };
    if (picking) return <button type="button" onClick={() => onReceive(null)} title={t('swapOut', {name: f.player.name})} className={cls} {...drop}>{body}</button>;
    return <Link href={`/players/${f.player.slug}`} target="_blank" rel="noopener noreferrer" title={t('dropHere', {name: f.player.name})} className={cls} {...drop}>{body}</Link>;
}

/**
 * The bench next to the pitch, as short rows that can be dragged onto it
 * (or placed with the ⇄ button): the list scrolls on its own while the
 * pitch stays put, so a substitute is always a short drag away.
 */
function BenchStrip({bench, slots, byId, pinned, benched, outs, picking, locked, onPlace, onUnbench}: {bench: PlayerForecast[]; slots: Map<number, number>; byId: Map<number, AuctionPlayer>; pinned: ReadonlySet<number>; benched: ReadonlySet<number>; outs: ReadonlySet<number>; picking: number | null; locked: boolean; onPlace: (id: number) => void; onUnbench: (id: number) => void}) {
    const t = useTranslations('Fantasy.lineup');
    return (
        <div className="bb-surface flex flex-col min-h-0 md:relative md:h-full">
            <div className="flex items-center gap-1.5 px-3 h-9 border-b-2 border-foreground bg-card rounded-t-[calc(var(--radius-lg)-2px)] text-[12px] font-extrabold uppercase tracking-wide shrink-0">
                {t('benchTitle', {count: bench.length})}
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground normal-case tracking-normal" title={t('dragHint')}><ArrowLeftRight className="w-3 h-3" aria-hidden="true" />{t('dragShort')}</span>
            </div>
            <ul className="flex flex-col max-h-72 md:max-h-none md:absolute md:inset-x-0 md:top-9 md:bottom-0 overflow-y-auto [scrollbar-width:thin]">
                {bench.map((f) => {
                    const p = byId.get(f.player.id);
                    const isPicking = picking === f.player.id;
                    const isBenched = benched.has(f.player.id);
                    const out = outs.has(f.player.id);
                    const surname = f.player.name.split(' ').slice(-1)[0] ?? f.player.name;
                    return (
                        <li key={f.player.id} className={cn("flex items-center gap-1.5 px-2 h-9 border-t border-muted first:border-t-0 text-[12px]", !locked && "cursor-grab active:cursor-grabbing", isPicking ? "bg-accent/40" : isBenched ? "bg-red-100/60" : out || f.plays < 0.2 ? "opacity-60" : "", pinned.has(f.player.id) && "bg-accent/20")} title={`${f.player.name} · ${pct(f.plays)} · ${(slots.get(f.player.id) ?? f.value).toFixed(2)}`} {...dragProps(f.player.id, locked)}>
                            <RoleBadge role={f.player.role} />
                            {p && <TeamCrest team={p.team} size={18} />}
                            <span className="font-extrabold truncate min-w-0">{surname}</span>
                            {isBenched && <span className="bb-badge text-[8px] h-3.5 px-1 uppercase bg-red-200 shrink-0">{t('benchedShort')}</span>}
                            <span className="ml-auto flex items-center gap-1 shrink-0">
                                <span className={cn("font-mono text-[10px] font-extrabold tabular-nums px-1 rounded border border-foreground/40 leading-[16px]", chanceClass(f.plays))}>{pct(f.plays)}</span>
                                <span className="font-mono text-[11px] font-extrabold tabular-nums w-8 text-right">{(slots.get(f.player.id) ?? f.value).toFixed(1)}</span>
                                {isBenched ? (
                                    <button type="button" onClick={() => onUnbench(f.player.id)} disabled={locked} title={locked ? t('lockedNoChange') : t('unbench')} className="bb-btn h-6 w-6 inline-flex items-center justify-center disabled:opacity-40 bg-red-700 text-background"><RotateCcw className="w-3 h-3" aria-hidden="true" /></button>
                                ) : (
                                    <button type="button" onClick={() => onPlace(f.player.id)} disabled={locked} aria-pressed={isPicking} title={locked ? t('lockedNoChange') : t('place')} className={cn("bb-btn h-6 w-6 inline-flex items-center justify-center disabled:opacity-40", isPicking ? "bg-accent" : "bg-card")}><ArrowLeftRight className="w-3 h-3" aria-hidden="true" /></button>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** The eleven on a pitch: attackers at the top, the keeper at the bottom. */
function FantasyPitch({starters, formation, byId, pinned, picking, onSwap, onPlace}: {starters: PlayerForecast[]; formation: FormationKey; byId: Map<number, AuctionPlayer>; pinned: ReadonlySet<number>; /** The substitute being placed by hand, if any. */ picking: number | null; onSwap: (inId: number, outId: number) => void; onPlace: (inId: number) => void}) {
    // The spots as last drawn: a lineup that changed is laid over them, newcomers in the places left free.
    const [spots, setSpots] = useState<Spot[]>([]);
    const order = keepSpots(spots, starters.map((f) => f.player));
    if (!sameSpots(order, spots)) setSpots(order);
    const rank = new Map(order.map((s, i) => [s.id, i]));
    const rows = [...ROLES].reverse().map((role) => starters.filter((f) => f.player.role === role).sort((a, b) => (rank.get(a.player.id) ?? 99) - (rank.get(b.player.id) ?? 99)));
    return (
        <div
            className={cn("relative rounded-xl border-[2.5px] border-foreground overflow-hidden bg-[#3f8f3a] text-background", picking !== null && "ring-4 ring-accent")}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={(e) => { e.preventDefault(); const id = draggedId(e); if (id !== null) onPlace(id); }}
        >
            <div className="absolute inset-2 border-2 border-white/60 rounded-sm pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 top-2 w-[44%] h-[13%] -ml-[22%] border-2 border-t-0 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 bottom-2 w-[44%] h-[13%] -ml-[22%] border-2 border-b-0 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_10%,rgba(255,255,255,0.05)_10%,rgba(255,255,255,0.05)_20%)] pointer-events-none" aria-hidden="true" />
            <div className="relative flex flex-col gap-2 md:gap-3 px-2 py-3">
                <div className="flex items-center justify-end px-1 text-[11px] font-extrabold uppercase tracking-wide"><span className="font-mono">{formation}</span></div>
                {rows.map((line, i) => (
                    <div key={i} className="flex justify-around">{line.map((f) => <PitchDot key={f.player.id} f={f} byId={byId} pinned={pinned.has(f.player.id)} picking={picking !== null} onReceive={(inId) => onSwap(inId ?? picking!, f.player.id)} />)}</div>
                ))}
            </div>
        </div>
    );
}

/** Green for what plays in his favour, red against, from thresholds; neutral in between. */
type Tone = 'good' | 'fine' | 'none' | 'bad' | 'worst';
const TONE_CLASS: Record<Tone, string> = {good: "bg-emerald-200", fine: "bg-emerald-100", none: "bg-card", bad: "bg-red-100", worst: "bg-red-200"};
function toneOf(v: number, [worst, bad, fine, good]: [number, number, number, number]): Tone {
    if (v >= good) return 'good';
    if (v >= fine) return 'fine';
    if (v <= worst) return 'worst';
    if (v <= bad) return 'bad';
    return 'none';
}

function Cell({tone, title, children, strong = false}: {tone: Tone; title?: string; children: React.ReactNode; strong?: boolean}) {
    return <span className={cn("bb-badge font-mono tabular-nums h-5 px-1 whitespace-nowrap", strong ? "text-[12px] font-extrabold" : "text-[11px] font-bold", TONE_CLASS[tone])} title={title}>{children}</span>;
}

/** The forecast's reasons, one field each, for the columns. */
function facts(f: PlayerForecast) {
    const by = <K extends ForecastReason['kind']>(kind: K) => f.reasons.find((r): r is Extract<ForecastReason, {kind: K}> => r.kind === kind);
    return {usage: by('usage'), form: by('form'), playerForm: by('playerForm'), match: by('match'), attack: by('attack'), cleanSheet: by('cleanSheet'), official: by('official'), sidelined: by('sidelined'), doubtful: by('doubtful'), manual: by('manual'), noMatch: by('noMatch'), noUsage: by('noUsage')};
}

interface Signal {
    key: string;
    label: string;
    tone: Tone;
    title: string;
}

/**
 * What decides the forecast, as a handful of coloured chips: only what is
 * notable (a starter at risk, a hot or cold streak, an easy or hard
 * match, a likely clean sheet, the penalties). The numbers behind every
 * chip sit in its tooltip and in the "why" panel.
 */
function signalsOf(f: PlayerForecast, x: ReturnType<typeof facts>, t: ReturnType<typeof useTranslations<'Fantasy.lineup'>>, reasonText: (r: ForecastReason) => string): Signal[] {
    const out: Signal[] = [];
    const defensive = f.player.role === 'P' || f.player.role === 'D';
    if (x.usage) {
        const rate = (x.usage.started + 0.5 * x.usage.came) / Math.max(1, x.usage.total);
        if (rate < 0.5) out.push({key: 'usage', label: t('signals.usageLow'), tone: 'worst', title: reasonText(x.usage)});
        else if (rate < 0.8) out.push({key: 'usage', label: t('signals.usageMid'), tone: 'bad', title: reasonText(x.usage)});
    } else if (x.noUsage) out.push({key: 'usage', label: t('signals.usageNone'), tone: 'worst', title: reasonText(x.noUsage)});
    if (x.playerForm) {
        const gap = x.playerForm.avg - x.playerForm.base;
        if (gap >= 0.25) out.push({key: 'form', label: t('signals.formUp'), tone: 'good', title: reasonText(x.playerForm)});
        else if (gap <= -0.25) out.push({key: 'form', label: t('signals.formDown'), tone: 'bad', title: reasonText(x.playerForm)});
    }
    if (x.match) {
        const title = x.cleanSheet ? `${reasonText(x.match)} · ${reasonText(x.cleanSheet)}` : reasonText(x.match);
        if (defensive) {
            if (x.match.lambdaAgainst <= 1.0) out.push({key: 'match', label: t('signals.defenceEasy'), tone: 'good', title});
            else if (x.match.lambdaAgainst >= 1.6) out.push({key: 'match', label: t('signals.defenceHard'), tone: 'bad', title});
        } else {
            if (x.match.lambdaFor >= 1.6) out.push({key: 'match', label: t('signals.attackEasy'), tone: 'good', title});
            else if (x.match.lambdaFor <= 0.9) out.push({key: 'match', label: t('signals.attackHard'), tone: 'bad', title});
        }
    }
    if (f.player.penaltyTaker && f.player.role !== 'P') out.push({key: 'penalty', label: t('signals.penalty'), tone: 'good', title: t('reasons.penalty')});
    return out.slice(0, 3);
}

/** How a substitute gets into the eleven by hand: dragged onto a starter, or placed with a tap; and the way back when he was sent out by hand. */
interface SwapControls {
    /** Sent to the bench by hand: someone else took his place. */
    benched: boolean;
    onUnbench: () => void;
    /** Start placing him: the starters become the choice of who leaves. */
    onPlace: () => void;
    picking: boolean;
}
/** The drag handlers of a substitute: his id travels with the pointer. */
function dragProps(id: number, locked: boolean) {
    if (locked) return {};
    return {draggable: true, onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DRAG_TYPE, String(id)); e.dataTransfer.effectAllowed = 'move'; }};
}

function ForecastRow({f, slot, index, byId, teamById, reasonText, muted = false, stripe = false, pinned, onPin, out, onOut, locked, swap}: {f: PlayerForecast; teamById: Map<number, TeamSummary>; /** What the slot is worth with the substitution; the plain value when unknown. */ slot: number | undefined; index: number | null; byId: Map<number, AuctionPlayer>; reasonText: (r: ForecastReason) => string; muted?: boolean; /** Every other row, so the eye follows one across the columns. */ stripe?: boolean; pinned: boolean; onPin: () => void; out: boolean; onOut: () => void; /** The round has kicked off: nothing can be changed. */ locked: boolean; /** On the bench: how he gets in. */ swap?: SwapControls}) {
    const t = useTranslations('Fantasy.lineup');
    const format = useFormatter();
    const [why, setWhy] = useState(false);
    const p = byId.get(f.player.id);
    const fixture = f.fixture;
    const kickoff = fixture ? format.dateTime(new Date(fixture.startingAt), {weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ROME}) : null;
    const opponent = p && fixture ? (teamById.get(f.opponent!.id) ?? {id: f.opponent!.id, name: f.opponent!.name, shortCode: null, logoUrl: null}) : null;
    const state = fixture ? (fixture.state === 'finished' ? t('played') : ['live', 'half_time', 'extra_time', 'penalties'].includes(fixture.state) ? t('live') : fixture.state === 'postponed' || fixture.state === 'cancelled' ? t('postponed') : null) : null;
    const x = facts(f);
    // Status badges: what settles his chance before the numbers.
    const status: Array<{key: string; label: string; tone: Tone; reason: ForecastReason}> = [];
    if (x.manual) status.push({key: 'manual', label: t('status.manual'), tone: 'worst', reason: x.manual});
    if (x.official) status.push({key: 'official', label: t(`status.official.${x.official.status}`), tone: x.official.status === 'starter' ? 'good' : x.official.status === 'bench' ? 'bad' : 'worst', reason: x.official});
    if (x.sidelined) status.push({key: 'sidelined', label: t(x.sidelined.category === 'injury' ? 'status.injury' : x.sidelined.category === 'suspension' ? 'status.suspension' : 'status.absent'), tone: 'worst', reason: x.sidelined});
    if (x.doubtful) status.push({key: 'doubtful', label: t('status.doubtful'), tone: 'bad', reason: x.doubtful});
    if (x.noMatch) status.push({key: 'noMatch', label: t('status.noMatch'), tone: 'worst', reason: x.noMatch});
    const td = "px-1 py-1.5 text-center";
    const bg = pinned ? "bg-accent/20" : swap?.picking ? "bg-accent/40" : out ? "bg-red-100/60" : swap?.benched ? "bg-muted" : stripe ? "bg-muted/60" : "";
    return (
        <>
        <tr className={cn("border-t border-muted align-middle", muted && !pinned && "opacity-70", bg, swap && !locked && "cursor-grab active:cursor-grabbing")} {...(swap ? dragProps(f.player.id, locked) : {})}>
            <td className="px-1 py-1.5">
                <span className="flex items-center gap-0.5">
                    {swap && (swap.benched ? (
                        <button type="button" onClick={swap.onUnbench} disabled={locked} title={locked ? t('lockedNoChange') : t('unbench')} className="bb-btn h-6 w-5 inline-flex items-center justify-center disabled:opacity-40 bg-red-700 text-background">
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        </button>
                    ) : (
                        <button type="button" onClick={swap.onPlace} disabled={locked} aria-pressed={swap.picking} title={locked ? t('lockedNoChange') : t('place')} className={cn("bb-btn h-6 w-5 inline-flex items-center justify-center disabled:opacity-40", swap.picking ? "bg-accent" : "bg-card")}>
                            <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                    ))}
                    <button type="button" onClick={onPin} disabled={locked} aria-pressed={pinned} title={locked ? t('lockedNoChange') : pinned ? t('unpin') : t('pin')} className={cn("bb-btn h-6 w-5 inline-flex items-center justify-center disabled:opacity-40", pinned ? "bg-foreground text-background" : "bg-card")}>
                        {pinned ? <PinOff className="w-3 h-3" aria-hidden="true" /> : <Pin className="w-3 h-3" aria-hidden="true" />}
                    </button>
                    <button type="button" onClick={onOut} disabled={locked} aria-pressed={out} title={locked ? t('lockedNoChange') : out ? t('unout') : t('out')} className={cn("bb-btn h-6 w-5 inline-flex items-center justify-center disabled:opacity-40", out ? "bg-red-700 text-background" : "bg-card")}>
                        <Ban className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-label={t('why')} title={t('whyHint')} className={cn("bb-btn h-6 w-5 inline-flex items-center justify-center", why ? "bg-foreground text-background" : "bg-card")}>
                        <HelpCircle className="w-3 h-3" aria-hidden="true" />
                    </button>
                </span>
            </td>
            <td className="px-1 py-1.5">
                <span className="inline-flex items-center gap-0.5">
                    {index !== null && <span className="font-mono text-[10px] font-extrabold tabular-nums text-muted-foreground w-3.5 text-right">{index}</span>}
                    <RoleBadge role={f.player.role} />
                </span>
            </td>
            <td className="px-2 py-1.5">
                <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                    {p && <TeamCrest team={p.team} size={18} />}
                    <Link href={`/players/${f.player.slug}`} target="_blank" rel="noopener noreferrer" draggable={false} title={f.reasons.map(reasonText).join(' · ')} className="font-extrabold text-[13px] truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{f.player.name}</Link>
                </span>
                {(status.length > 0 || swap?.benched) && (
                    <span className="flex flex-wrap gap-1 mt-0.5">
                        {swap?.benched && <span className="bb-badge text-[9px] h-4 px-1 uppercase bg-red-200">{t('benchedBadge')}</span>}
                        {status.map((b) => <span key={b.key} className={cn("bb-badge text-[9px] h-4 px-1 uppercase", TONE_CLASS[b.tone])} title={reasonText(b.reason)}>{b.label}</span>)}
                    </span>
                )}
            </td>
            <td className="px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap">
                {fixture && opponent ? (
                    <span className="inline-flex items-center gap-1.5" title={`${f.home ? t('vsHome', {team: opponent.name}) : t('vsAway', {team: opponent.name})} · ${kickoff}`}>
                        <TeamCrest team={opponent} size={22} />
                        <span className={cn("bb-badge h-4 px-1 text-[9px] font-extrabold", f.home ? "bg-card" : "bg-muted")}>{f.home ? t('atHome') : t('atAway')}</span>
                        <span className="text-muted-foreground">{kickoff}{state && <span className="ml-1 uppercase">· {state}</span>}</span>
                    </span>
                ) : (
                    <span className="text-muted-foreground">{t('noFixture')}</span>
                )}
            </td>
            <td className={td}><Cell tone={f.plays >= 0.8 ? 'good' : f.plays >= 0.5 ? 'fine' : f.plays >= 0.2 ? 'bad' : 'worst'} title={t('playsSplit', {start: pct(f.starts), sub: pct(Math.max(0, f.plays - f.starts)), subPoints: f.subPoints.toFixed(2)})}>{pct(f.plays)}</Cell></td>
            <td className="px-2 py-1.5 w-full">
                <span className="flex flex-wrap gap-1">
                    {signalsOf(f, x, t, reasonText).map((sg) => <span key={sg.key} className={cn("bb-badge text-[10px] h-5 px-1.5 whitespace-nowrap", TONE_CLASS[sg.tone])} title={sg.title}>{sg.label}</span>)}
                </span>
            </td>
            <td className={td}><Cell strong tone={toneOf(slot ?? f.value, [5.8, 6.4, 7.0, 7.5])} title={t('slotOf', {value: f.value.toFixed(2)})}>{(slot ?? f.value).toFixed(2)}</Cell></td>
        </tr>
        {why && (
            <tr className={cn("align-top", bg)}>
                <td colSpan={7} className="px-3 pb-2 pt-0">
                    <div className="rounded-lg border-2 border-foreground bg-card px-3 py-2 flex flex-col gap-1">
                        <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide">
                            {f.player.name}
                            <span className="font-mono normal-case tracking-normal text-muted-foreground">{t('colRating')} {f.rating.toFixed(2)} · {t('colPoints')} {f.points.toFixed(2)} · {t('colValue')} {(slot ?? f.value).toFixed(2)}</span>
                            <button type="button" onClick={() => setWhy(false)} aria-label={t('whyClose')} className="ml-auto inline-flex w-5 h-5 items-center justify-center rounded border border-foreground/50 bg-background hover:bg-accent"><X className="w-3 h-3" aria-hidden="true" /></button>
                        </span>
                        <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-[11px] font-semibold list-disc pl-4">
                            {f.reasons.map((r, i) => <li key={i}>{reasonText(r)}</li>)}
                        </ul>
                    </div>
                </td>
            </tr>
        )}
        </>
    );
}

/** A player's forecast as a card, for phones: the numbers that decide, the status and the pin and out buttons, the reasons on request. */
function ForecastCard({f, slot, index, byId, teamById, reasonText, muted = false, pinned, onPin, out, onOut, locked, swap}: {f: PlayerForecast; teamById: Map<number, TeamSummary>; slot: number | undefined; index: number | null; byId: Map<number, AuctionPlayer>; reasonText: (r: ForecastReason) => string; muted?: boolean; pinned: boolean; onPin: () => void; out: boolean; onOut: () => void; locked: boolean; swap?: SwapControls}) {
    const t = useTranslations('Fantasy.lineup');
    const format = useFormatter();
    const [more, setMore] = useState(false);
    const p = byId.get(f.player.id);
    const x = facts(f);
    const fixture = f.fixture;
    const kickoff = fixture ? format.dateTime(new Date(fixture.startingAt), {weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME}) : null;
    const status: Array<{key: string; label: string; tone: Tone}> = [];
    if (x.manual) status.push({key: 'manual', label: t('status.manual'), tone: 'worst'});
    if (x.official) status.push({key: 'official', label: t(`status.official.${x.official.status}`), tone: x.official.status === 'starter' ? 'good' : x.official.status === 'bench' ? 'bad' : 'worst'});
    if (x.sidelined) status.push({key: 'sidelined', label: t(x.sidelined.category === 'injury' ? 'status.injury' : x.sidelined.category === 'suspension' ? 'status.suspension' : 'status.absent'), tone: 'worst'});
    if (x.doubtful) status.push({key: 'doubtful', label: t('status.doubtful'), tone: 'bad'});
    if (x.noMatch) status.push({key: 'noMatch', label: t('status.noMatch'), tone: 'worst'});
    return (
        <li className={cn("px-2.5 py-2 flex flex-col gap-1.5 border-t border-muted first:border-t-0", muted && !pinned && "opacity-70", pinned && "bg-accent/20", swap?.picking && "bg-accent/40", out && "bg-red-100/60", swap?.benched && !out && "bg-muted")} {...(swap ? dragProps(f.player.id, locked) : {})}>
            <div className="flex items-center gap-2 min-w-0">
                {index !== null && <span className="font-mono text-[11px] font-extrabold tabular-nums text-muted-foreground w-4">{index}</span>}
                <RoleBadge role={f.player.role} />
                {p && <TeamCrest team={p.team} size={18} />}
                <span className="flex flex-col leading-tight min-w-0">
                    <Link href={`/players/${f.player.slug}`} target="_blank" rel="noopener noreferrer" draggable={false} className="font-extrabold text-[14px] truncate">{f.player.name}</Link>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground truncate">
                        {fixture && f.opponent ? (
                            <>
                                <TeamCrest team={teamById.get(f.opponent.id) ?? {id: f.opponent.id, name: f.opponent.name, shortCode: null, logoUrl: null}} size={14} />
                                <span className="bb-badge h-3.5 px-1 text-[8px] font-extrabold bg-card">{f.home ? t('atHome') : t('atAway')}</span>
                                {kickoff}
                            </>
                        ) : t('noFixture')}
                    </span>
                </span>
                <span className="ml-auto flex items-center gap-1 shrink-0">
                    <Cell tone={f.plays >= 0.8 ? 'good' : f.plays >= 0.5 ? 'fine' : f.plays >= 0.2 ? 'bad' : 'worst'}>{pct(f.plays)}</Cell>
                    <Cell strong tone={toneOf(slot ?? f.value, [5.8, 6.4, 7.0, 7.5])}>{(slot ?? f.value).toFixed(1)}</Cell>
                </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
                {swap?.benched && <span className="bb-badge text-[9px] h-4 px-1 uppercase bg-red-200">{t('benchedBadge')}</span>}
                {status.map((b) => <span key={b.key} className={cn("bb-badge text-[9px] h-4 px-1 uppercase", TONE_CLASS[b.tone])}>{b.label}</span>)}
                {signalsOf(f, x, t, reasonText).map((sg) => <span key={sg.key} className={cn("bb-badge text-[10px] h-5 px-1.5 whitespace-nowrap", TONE_CLASS[sg.tone])} title={sg.title}>{sg.label}</span>)}
                <span className="ml-auto inline-flex items-center gap-1">
                    <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="bb-btn h-7 px-2 text-[11px] font-extrabold bg-card">{more ? t('cardLess') : t('cardMore')}</button>
                    {swap && (swap.benched ? (
                        <button type="button" onClick={swap.onUnbench} disabled={locked} title={t('unbench')} className="bb-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-40 bg-red-700 text-background"><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /></button>
                    ) : (
                        <button type="button" onClick={swap.onPlace} disabled={locked} aria-pressed={swap.picking} title={t('place')} className={cn("bb-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-40", swap.picking ? "bg-accent" : "bg-card")}><ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" /></button>
                    ))}
                    <button type="button" onClick={onPin} disabled={locked} aria-pressed={pinned} title={pinned ? t('unpin') : t('pin')} className={cn("bb-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-40", pinned ? "bg-foreground text-background" : "bg-card")}>{pinned ? <PinOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Pin className="w-3.5 h-3.5" aria-hidden="true" />}</button>
                    <button type="button" onClick={onOut} disabled={locked} aria-pressed={out} title={out ? t('unout') : t('out')} className={cn("bb-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-40", out ? "bg-red-700 text-background" : "bg-card")}><Ban className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </span>
            </div>
            {more && (
                <div className="text-[11px] font-semibold text-muted-foreground flex flex-col gap-0.5">
                    <span>{t('colRating')} {f.rating.toFixed(2)} · {t('colPoints')} {f.points.toFixed(2)} · {t('colValue')} {(slot ?? f.value).toFixed(2)}</span>
                    <span>{f.reasons.map(reasonText).join(' · ')}</span>
                </div>
            )}
        </li>
    );
}

/** Copies the eleven and the bench as plain text, ready to paste in the league's app. */
function Head() {
    const t = useTranslations('Fantasy.lineup');
    const th = "px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground text-center whitespace-nowrap";
    return (
        <thead className="bg-card">
            <tr>
                <th className={cn(th, "px-1")} aria-label={t('colPin')} />
                <th className={cn(th, "px-1")} aria-label={t('colRole')} />
                <th className={cn(th, "text-left px-2")}>{t('colPlayer')}</th>
                <th className={cn(th, "text-left px-2")}>{t('colMatch')}</th>
                <th className={cn(th, "min-w-[3rem]")} title={t('colPlaysHint')}>{t('colPlays')}</th>
                <th className={cn(th, "text-left px-2")} title={t('colSignalsHint')}>{t('colSignals')}</th>
                <th className={cn(th, "min-w-[3.25rem]")} title={t('colValueHint')}>{t('colValue')}</th>
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
        router.replace(`/fantacalcio/formazione?league=${current.league}`);
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
        <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-2">
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

    return <LineupBoard key={current.id} current={current} context={context} roster={roster} byId={byId} teamById={new Map(pool.teams.map((tm) => [tm.id, tm]))} toolbar={toolbar} roundInfo={roundInfo} signedIn={account.user !== null} />;
}

/** The advice for one team: forecasts, pins and outs, the formation, the tables; frozen once the round has kicked off. */
function LineupBoard({current, context, roster, byId, teamById, toolbar, roundInfo, signedIn}: {current: SavedTeam; context: MatchdayContext; roster: AuctionPlayer[]; byId: Map<number, AuctionPlayer>; teamById: Map<number, TeamSummary>; toolbar: React.ReactNode; roundInfo: MatchdayRound | null; signedIn: boolean}) {
    const t = useTranslations('Fantasy.lineup');
    const router = useRouter();
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
    const pickingPlayer = picking !== null ? byId.get(picking) ?? null : null;
    const pinCost = Math.round((free.total - advice.total) * 10) / 10;
    const rosterTeams = [...new Set(roster.map((p) => p.team.id))];
    const withOfficial = rosterTeams.filter((id) => context.officialTeams.includes(id)).length;
    const fixturesOfRoster = context.fixtures.filter((f) => rosterTeams.includes(f.home.id) || rosterTeams.includes(f.away.id));
    const missingCount = ROLES.reduce((s, r) => s + Math.max(0, (FORMATIONS.find((f) => f.key === advice.formation)?.need[r] ?? 0) - forecasts.filter((f) => f.player.role === r).length), 0);
    const when = (iso: string) => format.dateTime(new Date(iso), {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME});
    // The rounds of the recap: each with its lock, still in place or already kept aside.
    const lockOf = (round: string) => (stored?.round === round ? stored : (history[current.id] ?? []).find((l) => l.round === round) ?? null);

    return (
        <div className="flex flex-col gap-3">
            {toolbar}
            <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] font-semibold">
                <span className={cn("inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border-2 border-foreground font-extrabold", frozen ? "bg-amber-200" : "bg-emerald-200")}>
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    {frozen ? t('status.locked') : roundInfo ? t('status.open', {when: when(roundInfo.from)}) : t('status.openNoDate')}
                </span>
                {roundInfo && <span className="text-muted-foreground">{when(roundInfo.from)} → {when(roundInfo.to)}</span>}
                <span className={cn("bb-badge text-[10px] h-5 px-1.5", withOfficial > 0 ? "bg-emerald-200" : "bg-card")}>{t('officialCount', {have: withOfficial, total: rosterTeams.length})}</span>
                <span className="text-muted-foreground ml-auto">{frozen ? t('frozenAt', {when: when(frozen.savedAt)}) : t('updated', {when: format.dateTime(new Date(context.generatedAt), {hour: '2-digit', minute: '2-digit', timeZone: ROME})})}</span>
            </div>
            {frozen && (
                <div className="bb-surface px-3 py-2 flex items-start gap-2 text-[12px] font-semibold bg-amber-100">
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span><span className="font-extrabold">{t('locked.title')}</span> {frozenFresh ? t('locked.fresh', {deadline: when(frozen.deadline)}) : t('locked.text', {deadline: when(frozen.deadline), savedAt: when(frozen.savedAt)})}</span>
                </div>
            )}

            {context.results.map((results) => <RoundRecap key={results.round} team={current} results={results} seasonId={context.seasonId} roster={roster} byId={byId} past={lockOf(results.round)} calibration={context.calibration} signedIn={signedIn} onSaved={() => router.refresh()} />)}
            <RecapHistory team={current} roster={roster} current={context.results} locks={[...(history[current.id] ?? []), ...(stored ? [stored] : [])]} seasonId={context.seasonId} calibration={context.calibration} />

            <div className="grid gap-3 grid-cols-1 xl:grid-cols-3 items-start">
                <div className="xl:col-span-2 flex flex-col gap-3 min-w-0">
                    {fixturesOfRoster.length > 0 && (
                        <ul aria-label={t('fixturesTitle')} className="bb-surface px-2 py-1.5 flex gap-1.5 overflow-x-auto [scrollbar-width:thin]">
                            {fixturesOfRoster.map((f) => {
                                const mine = roster.filter((p) => p.team.id === f.home.id || p.team.id === f.away.id);
                                const official = context.officialTeams.includes(f.home.id) || context.officialTeams.includes(f.away.id);
                                const starting = mine.filter((p) => advice.starters.some((s) => s.player.id === p.id)).length;
                                return (
                                    <li key={f.id} title={`${when(f.startingAt)}${f.prediction ? ` · ${Math.round(f.prediction.home)}% · ${Math.round(f.prediction.draw)}% · ${Math.round(f.prediction.away)}% · xG ${f.prediction.lambdaHome.toFixed(1)}-${f.prediction.lambdaAway.toFixed(1)}` : ''}\n${mine.map((p) => p.name).join(', ')}`} className="shrink-0 inline-flex flex-col gap-0.5 px-2 py-1 rounded-md border border-foreground/40 bg-card text-[11px] font-bold leading-tight">
                                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                            <span className={cn(rosterTeams.includes(f.home.id) && "underline decoration-accent decoration-2 underline-offset-2")}>{f.home.name}</span>
                                            <span className="text-muted-foreground">–</span>
                                            <span className={cn(rosterTeams.includes(f.away.id) && "underline decoration-accent decoration-2 underline-offset-2")}>{f.away.name}</span>
                                            {official && <span className="bb-badge bg-emerald-200 text-[9px] h-4 px-1">{t('officialBadge')}</span>}
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
                    <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold">
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
                    <Panel title={t('startersTitle', {formation: advice.formation, total: advice.total.toFixed(1)})}>
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
                    </Panel>
                    <Panel title={<span title={`${t('benchHint')}\n${t('dragHint')}`} className="inline-flex items-center gap-1.5">{t('benchTitle', {count: advice.bench.length})}<HelpCircle className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" /></span>} action={<span className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><ArrowLeftRight className="w-3 h-3" aria-hidden="true" />{t('dragShort')}</span>}>
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
                    <Panel title={<span title={t('formationsHint')} className="inline-flex items-center gap-1.5">{t('formationsTitle')}<HelpCircle className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" /></span>}>
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

                    </Panel>
                    <details className="bb-surface overflow-hidden group">
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
