import type {DefenceBonus, Purchase} from './config';
import type {FantaRole, FantaScores} from './scores';
import {bestLineup, FORMATIONS, playerValue, type FormationKey, type Lineup} from './strategies';

/**
 * The report card of a roster, mine or a rival's: one mark for the
 * team, the best eleven it can field, and a line per role. Marks are
 * the players' auction marks (0-100), so a roster reads like the list.
 */

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
/** From this starter mark a player counts as a sure starter. */
export const SURE_STARTER = 70;

export interface ReportPlayer {
    id: number;
    name: string;
    role: FantaRole;
    scores: Pick<FantaScores, 'starter' | 'overall' | 'fantaAvg' | 'bonus' | 'fitness'>;
    injury: {longTerm: boolean} | null;
    contested: boolean;
}

export interface RoleReport {
    role: FantaRole;
    count: number;
    slots: number;
    /** Sure starters among them. */
    starters: number;
    /** Average starter mark, all of them. */
    starter: number;
    /** Average auction mark, all of them. */
    overall: number;
    /** Average estimated fantasy average, whoever has one. */
    fantaAvg: number | null;
    /** Average bonus mark. */
    bonus: number;
    /** Credits spent on the role. */
    spent: number;
    /** Out for long, or with a contested place. */
    injured: number;
    contested: number;
    /** The best of them by auction mark. */
    best: {id: number; name: string; overall: number} | null;
}

export interface TeamReport {
    /** The team's mark: the auction marks of the eleven it would field, over eleven places (a short roster scores for what it has). */
    overall: number;
    /** Average starter mark of those eleven. */
    starter: number;
    /** Average estimated fantasy average of those eleven. */
    fantaAvg: number | null;
    /** The eleven's formation and expected points per match; null until eleven players are there. */
    lineup: Pick<Lineup, 'formation' | 'value'> | null;
    /** The shape of the eleven counted, whether or not eleven are there yet. */
    formation: FormationKey;
    filled: number;
    total: number;
    starters: number;
    injured: number;
    contested: number;
    roles: RoleReport[];
}

const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length);
const round = (v: number) => Math.round(v);
const round1 = (v: number) => Math.round(v * 10) / 10;

/** The eleven (or fewer) a roster would field: the best per role of the best formation, by expected points. */
function eleven(players: ReportPlayer[], formation: FormationKey): ReportPlayer[] {
    const shape = FORMATIONS.find((f) => f.key === formation) ?? FORMATIONS[0];
    return ROLES.flatMap((role) =>
        players
            .filter((p) => p.role === role)
            .sort((a, b) => playerValue(b) - playerValue(a))
            .slice(0, shape.need[role]),
    );
}

export function teamReport(players: ReportPlayer[], purchases: Purchase[], slots: Record<FantaRole, number>, options: {defenceModifier?: boolean | DefenceBonus} = {}): TeamReport {
    const priceOf = new Map(purchases.map((p) => [p.playerId, p.price]));
    const lineup = players.length >= 11 ? bestLineup(players, {defenceModifier: options.defenceModifier}) : null;
    // Short of eleven, the formation that fields most of what is there, best first.
    const formation = lineup?.formation ?? bestLineup(players, {defenceModifier: options.defenceModifier}).formation;
    const xi = eleven(players, formation);
    const withAvg = xi.filter((p) => p.scores.fantaAvg !== null);
    const roles = ROLES.map((role): RoleReport => {
        const own = players.filter((p) => p.role === role);
        const best = own.slice().sort((a, b) => b.scores.overall - a.scores.overall)[0];
        const avg = own.filter((p) => p.scores.fantaAvg !== null);
        return {
            role,
            count: own.length,
            slots: slots[role],
            starters: own.filter((p) => p.scores.starter >= SURE_STARTER).length,
            starter: round(mean(own.map((p) => p.scores.starter))),
            overall: round(mean(own.map((p) => p.scores.overall))),
            fantaAvg: avg.length > 0 ? round1(mean(avg.map((p) => p.scores.fantaAvg!))) : null,
            bonus: round(mean(own.map((p) => p.scores.bonus))),
            spent: own.reduce((s, p) => s + (priceOf.get(p.id) ?? 0), 0),
            injured: own.filter((p) => p.injury?.longTerm).length,
            contested: own.filter((p) => p.contested).length,
            best: best ? {id: best.id, name: best.name, overall: best.scores.overall} : null,
        };
    });
    // Over eleven places, whoever is there: a short roster is not yet a team.
    const overEleven = (values: number[]) => values.reduce((s, v) => s + v, 0) / 11;
    return {
        overall: round(overEleven(xi.map((p) => p.scores.overall))),
        starter: round(overEleven(xi.map((p) => p.scores.starter))),
        fantaAvg: withAvg.length > 0 ? round1(mean(withAvg.map((p) => p.scores.fantaAvg!))) : null,
        lineup: lineup ? {formation: lineup.formation, value: lineup.value} : null,
        formation,
        filled: players.length,
        total: ROLES.reduce((s, r) => s + slots[r], 0),
        starters: players.filter((p) => p.scores.starter >= SURE_STARTER).length,
        injured: players.filter((p) => p.injury?.longTerm).length,
        contested: players.filter((p) => p.contested).length,
        roles,
    };
}
