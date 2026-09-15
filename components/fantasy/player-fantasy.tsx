import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {RoleBadge} from "./role-badge";
import {getAuctionPool} from "@/lib/fantasy/data";
import {getMatchday} from "@/lib/fantasy/matchday-data";
import {roundNumber} from "@/lib/fantasy/matchday";
import {matchLabel, roundPoints, votoOf, type RoundResults, type RoundStat} from "@/lib/fantasy/recap";
import {CLASSIC_RULES, type FantaRole} from "@/lib/fantasy/scores";

const roundName = (round: string) => (/^Regular Season - \d+$/.test(round) ? round.slice('Regular Season - '.length) : round);
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export interface FantasyRoundRow {
    round: string;
    live: boolean;
    match: string | null;
    /** Null: no vote (did not play, or too few minutes). */
    voto: number | null;
    source: 'official' | 'manual' | 'estimate';
    points: number | null;
    stat: RoundStat;
}

export interface PlayerFantasyData {
    role: FantaRole;
    /** The season's fantasy average the auction expects, under the classic rules. */
    fantaAvg: number | null;
    overall: number;
    listQuote: number | null;
    penaltyTaker: boolean;
    rows: FantasyRoundRow[];
}

/** The rows of the player over the rounds known to the matchday, newest first. */
export function fantasyRows(playerId: number, role: FantaRole, rounds: RoundResults[], calibration: Parameters<typeof votoOf>[2]): FantasyRoundRow[] {
    const byRound = new Map<string, RoundResults>();
    for (const r of rounds) byRound.set(r.round, r);
    return [...byRound.values()]
        .sort((a, b) => (roundNumber(b.round) ?? 0) - (roundNumber(a.round) ?? 0))
        .flatMap((results) => {
            const stat = results.stats[playerId];
            if (!stat) return [];
            return [{round: results.round, live: results.state === 'live', match: null, voto: votoOf(stat, role, calibration), source: stat.source ?? 'estimate', points: roundPoints(stat, role, CLASSIC_RULES, calibration), stat}];
        });
}

/** The events the game paid, in words (server side). */
async function eventsText(stat: RoundStat, role: FantaRole): Promise<string> {
    const t = await getTranslations('Fantasy.lineup.recap.events');
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
    return parts.join(' · ');
}

/**
 * The fantasy side of a player on his page: the votes of his last
 * rounds (official when in, typed by users, else the site's estimate
 * from the provider's rating), the bonus and malus, the fantasy points
 * under the classic rules, and what the auction expects of him.
 */
export async function PlayerFantasyView({data}: {data: PlayerFantasyData}) {
    const t = await getTranslations('Fantasy.player');
    const voted = data.rows.filter((r) => r.voto !== null && !r.live);
    const avgVoto = voted.length > 0 ? voted.reduce((s, r) => s + r.voto!, 0) / voted.length : null;
    const avgPoints = voted.length > 0 ? voted.reduce((s, r) => s + (r.points ?? 0), 0) / voted.length : null;
    const real = voted.filter((r) => r.source !== 'estimate').length;
    const events = await Promise.all(data.rows.map((r) => eventsText(r.stat, data.role)));
    const sourceClass = {official: "bg-emerald-200", manual: "bg-card", estimate: "bg-amber-100"} as const;
    return (
        <Panel title={<span className="inline-flex items-center gap-2">{t('title')}<RoleBadge role={data.role} /></span>} action={<Link href="/fantacalcio/asta" className="text-[11px] font-extrabold hover:underline decoration-accent decoration-[2px] underline-offset-2">{t('toAuction')}</Link>}>
            <div className="flex overflow-x-auto border-b border-muted">
                {[
                    {value: avgPoints !== null ? avgPoints.toFixed(2) : '–', label: t('fantaAvgRecent', {count: voted.length}), accent: true},
                    {value: avgVoto !== null ? avgVoto.toFixed(2) : '–', label: t('avgVoto')},
                    {value: data.fantaAvg !== null ? data.fantaAvg.toFixed(2) : '–', label: t('fantaAvgExpected')},
                    {value: data.listQuote !== null ? String(data.listQuote) : '–', label: t('quote')},
                    {value: String(data.overall), label: t('overall')},
                ].map((s) => (
                    <div key={s.label} className={cn("flex-1 flex flex-col gap-0.5 px-2 py-2 border-l border-muted first:border-l-0 min-w-[68px]", s.accent && "bg-accent/40")}>
                        <span className="font-mono text-[18px] font-bold leading-none tabular-nums">{s.value}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{s.label}</span>
                    </div>
                ))}
            </div>
            <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground border-b border-muted">
                {real > 0 ? t('realCount', {real, total: voted.length}) : t('allEstimated')}
                {data.penaltyTaker && ` · ${t('penaltyTaker')}`}
            </p>
            {data.rows.length === 0 ? (
                <p className="px-3 py-3 text-[12px] font-semibold text-muted-foreground">{t('noRounds')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                <th className="px-2 py-1.5 text-left">{t('colRound')}</th>
                                <th className="px-2 py-1.5 text-right">{t('colVoto')}</th>
                                <th className="px-2 py-1.5 text-left">{t('colEvents')}</th>
                                <th className="px-2 py-1.5 text-right">{t('colPoints')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((r, i) => (
                                <tr key={r.round} className={cn("border-b border-muted last:border-b-0", i % 2 === 1 && "bg-muted/30")}>
                                    <td className="px-2 py-1">
                                        <span className="font-extrabold">{t('round', {round: roundName(r.round)})}</span>
                                        {r.live && <span className="bb-badge bg-amber-200 text-[9px] h-4 px-1 ml-1.5">{t('live')}</span>}
                                        {r.match && <span className="block text-[10px] font-semibold text-muted-foreground">{r.match}</span>}
                                    </td>
                                    <td className="px-2 py-1 text-right whitespace-nowrap">
                                        <span className="font-mono font-extrabold tabular-nums">{r.voto !== null ? fmt(r.voto) : <span className="text-muted-foreground font-semibold">{t('noVote')}</span>}</span>
                                        {r.voto !== null && <span className={cn("bb-badge text-[9px] h-4 px-1 ml-1", sourceClass[r.source])} title={t(`sourceHint.${r.source}`)}>{t(`source.${r.source}`)}</span>}
                                    </td>
                                    <td className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">{r.voto !== null ? events[i] : ''}</td>
                                    <td className="px-2 py-1 text-right font-mono font-extrabold tabular-nums">{r.points !== null ? fmt(r.points) : '–'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('rulesNote')}</p>
        </Panel>
    );
}

/** Loads the player's fantasy data (Serie A only); nothing when he is not on the list. */
export async function PlayerFantasy({playerId}: {playerId: number}) {
    const [pool, context] = await Promise.all([getAuctionPool('serie-a'), getMatchday('serie-a')]);
    const player = pool?.players.find((p) => p.id === playerId);
    if (!player) return null;
    const rounds = context ? [...context.history, ...context.results] : [];
    const rows = context ? fantasyRows(playerId, player.role, rounds, context.calibration).map((r) => ({...r, match: matchLabel(rounds.find((x) => x.round === r.round)!, player.team.id)})) : [];
    return <PlayerFantasyView data={{role: player.role, fantaAvg: player.scores.fantaAvg, overall: player.scores.overall, listQuote: player.listQuote, penaltyTaker: player.penaltyTaker, rows}} />;
}
