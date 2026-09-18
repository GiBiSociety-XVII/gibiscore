'use client';

import {Radio} from "lucide-react";
import {useFormatter, useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {Help} from "./help";
import {RoleBadge} from "./role-badge";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {LiveScore, LiveSlot} from "@/lib/fantasy/live-score";
import type {MatchdayFixture} from "@/lib/fantasy/matchday";
import type {RoundStat} from "@/lib/fantasy/recap";
import type {FantaRole} from "@/lib/fantasy/scores";

const ROME = 'Europe/Rome';
const fmt = (v: number) => String(Math.round(v * 100) / 100);
const signed = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));

/** The events the game paid so far, in words. */
function events(stat: RoundStat | undefined, role: FantaRole, over: boolean, t: ReturnType<typeof useTranslations<'Fantasy.lineup.recap.events'>>): string {
    if (!stat) return '';
    const parts: string[] = [];
    if (stat.goals > 0) parts.push(t('goals', {count: stat.goals}));
    if (stat.assists > 0) parts.push(t('assists', {count: stat.assists}));
    if (role === 'P' && stat.conceded > 0) parts.push(t('conceded', {count: stat.conceded}));
    if (role === 'P' && stat.conceded === 0 && over && stat.minutes >= 60) parts.push(t('cleanSheet'));
    if (stat.penaltiesSaved > 0) parts.push(t('penaltySaved'));
    if (stat.penaltiesMissed > 0) parts.push(t('penaltyMissed'));
    if (stat.ownGoals > 0) parts.push(t('ownGoal'));
    if (stat.yellow > 0) parts.push(t('yellow'));
    if (stat.red > 0) parts.push(t('red'));
    return parts.join(' · ');
}

function Row({s, byId, kickoff, stripe}: {s: LiveSlot; byId: Map<number, AuctionPlayer>; kickoff: string | null; stripe: boolean}) {
    const t = useTranslations('Fantasy.lineup.liveScore');
    const te = useTranslations('Fantasy.lineup.recap.events');
    const format = useFormatter();
    const player = byId.get(s.id);
    const name = player?.name ?? `#${s.id}`;
    const nameOf = (id: number | undefined) => (id === undefined ? '' : byId.get(id)?.name ?? `#${id}`);
    const replaced = s.replacedBy !== undefined;
    const over = s.state === 'done';
    const line = s.match ?? (kickoff ? format.dateTime(new Date(kickoff), {weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME}) : t('noMatch'));
    const note = replaced ? t('replacedBy', {name: nameOf(s.replacedBy)}) : s.replaces !== undefined ? t('cameIn', {name: nameOf(s.replaces)}) : over && s.points === null ? t('noVote') : null;
    const bonus = events(s.stat, s.role, over, te);
    return (
        <li className={cn("flex items-center gap-2 px-3 py-1.5 border-t border-muted first:border-t-0 text-[12px]", stripe && "bg-muted/40", s.state === 'live' && "bg-accent/15", s.state === 'pending' && "opacity-70")}>
            <RoleBadge role={s.role} />
            <div className="flex flex-col min-w-0 flex-1 leading-tight">
                <span className={cn("font-extrabold truncate", replaced && "line-through text-muted-foreground")}>{name}</span>
                <span className="text-[11px] font-semibold text-muted-foreground truncate">{line}{note ? ` · ${note}` : ''}</span>
            </div>
            <span className={cn("shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded border font-mono text-[10px] font-extrabold tabular-nums whitespace-nowrap", s.state === 'live' ? "border-red-700 text-red-700 bg-red-50 dark:bg-red-950/40" : s.state === 'done' ? "border-foreground/40 bg-card" : "border-muted text-muted-foreground")}>
                {s.state === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />}
                {s.state === 'live' ? (s.minute !== null ? `${s.minute}'` : t('inPlay')) : s.state === 'done' ? t('final') : t('toPlay')}
            </span>
            <div className="flex flex-col items-end shrink-0 w-[86px] leading-tight">
                <span className="font-mono text-[15px] font-extrabold tabular-nums">{s.points !== null ? fmt(s.points) : '–'}</span>
                <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-full" title={bonus || undefined}>{s.voto !== null ? `${t('voto')} ${fmt(s.voto)}${bonus ? ` · ${bonus}` : ''}` : bonus || ''}</span>
            </div>
        </li>
    );
}

/**
 * The lineup's points as the round is played: the total so far, where
 * every player's match stands, his vote and the bonus and malus he
 * earned, the substitutes who came in. Refreshed with the page while a
 * match is on the pitch.
 */
export function LiveScorePanel({score, byId, fixtures, official, roundLabel}: {score: LiveScore; byId: Map<number, AuctionPlayer>; fixtures: MatchdayFixture[]; /** The official votes of the round are in: nothing is an estimate. */ official: boolean; roundLabel: string}) {
    const t = useTranslations('Fantasy.lineup.liveScore');
    const kickoffOf = (teamId: number) => fixtures.find((f) => f.home.id === teamId || f.away.id === teamId)?.startingAt ?? null;
    const live = score.state === 'live';
    return (
        <Panel
            title={<span className="inline-flex items-center gap-1.5">{t(score.state === 'over' ? 'titleOver' : 'title', {round: roundLabel})}<Help text={t(official ? 'officialHint' : 'estimateHint')} /></span>}
            action={live ? <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md border-2 border-red-700 bg-red-50 dark:bg-red-950/40 text-red-700 font-mono text-[11px] font-extrabold"><Radio className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />{t('liveBadge')}</span> : <span className="text-[11px] font-semibold text-muted-foreground">{official ? t('officialBadge') : score.provisional ? t('provisionalBadge') : t('estimatedBadge')}</span>}
        >
            <div className="px-3 py-2 flex flex-wrap items-end gap-x-4 gap-y-1 border-b-2 border-foreground bg-card">
                <span className="font-mono text-[40px] leading-none font-extrabold tabular-nums">{fmt(score.total)}</span>
                <div className="flex flex-col gap-0.5 text-[11px] font-semibold text-muted-foreground leading-tight">
                    <span>{t('breakdown', {points: fmt(score.points)})}{score.defence > 0 ? ` · ${t('defence', {points: signed(score.defence)})}` : ''}</span>
                    <span>{t('counts.done', {count: score.counts.done})} · {t('counts.live', {count: score.counts.live})} · {t('counts.pending', {count: score.counts.pending})}</span>
                    {(score.subs > 0 || score.holes > 0) && <span>{[score.subs > 0 ? t('subs', {count: score.subs}) : null, score.holes > 0 ? t('holes', {count: score.holes}) : null].filter(Boolean).join(' · ')}</span>}
                </div>
                {live && <span className="ml-auto text-[10px] font-semibold text-muted-foreground self-end">{t('autoRefresh')}</span>}
            </div>
            <ul className="flex flex-col">
                {score.slots.map((s, i) => <Row key={s.id} s={s} byId={byId} kickoff={kickoffOf(s.teamId)} stripe={i % 2 === 1} />)}
            </ul>
            {score.bench.length > 0 && (
                <details className="border-t-2 border-foreground group">
                    <summary className="px-3 h-8 flex items-center justify-between cursor-pointer list-none text-[11px] font-extrabold uppercase tracking-wide bg-card">
                        {t('benchTitle', {count: score.bench.length})}
                        <span className="text-[10px] font-bold text-muted-foreground normal-case tracking-normal group-open:hidden">{t('benchOpen')}</span>
                    </summary>
                    <ul className="flex flex-col border-t border-muted">
                        {score.bench.map((s, i) => <Row key={s.id} s={s} byId={byId} kickoff={kickoffOf(s.teamId)} stripe={i % 2 === 1} />)}
                    </ul>
                </details>
            )}
        </Panel>
    );
}
