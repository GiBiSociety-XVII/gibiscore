/**
 * "Fantavoto GiBi": the classic Italian fantasy football score computed from
 * a match rating plus bonuses and maluses. The rating is the provider's
 * player rating, not a newspaper vote, so the site labels it as an estimate.
 *
 * Rules (the widespread default):
 *   goal +3, assist +1, penalty missed -3, penalty saved +3, own goal -2,
 *   yellow card -0.5, red card -1, goal conceded (goalkeepers) -1,
 *   clean sheet (goalkeepers, at least 60 minutes) +1.
 */

export interface FantasyInput {
    rating: number | null;
    position: string | null; // goalkeeper, defender, midfielder, attacker
    minutes: number | null;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    ownGoals?: number;
    penaltiesMissed?: number;
    penaltiesSaved?: number;
    goalsConceded?: number | null;
}

export const FANTASY_RULES = {
    goal: 3,
    assist: 1,
    penaltyMissed: -3,
    penaltySaved: 3,
    ownGoal: -2,
    yellowCard: -0.5,
    redCard: -1,
    goalConceded: -1,
    cleanSheet: 1,
} as const;

export function fantasyScore(input: FantasyInput): number | null {
    if (input.rating === null || !Number.isFinite(input.rating)) return null;
    if (input.minutes !== null && input.minutes <= 0) return null;

    let score = input.rating;
    score += input.goals * FANTASY_RULES.goal;
    score += input.assists * FANTASY_RULES.assist;
    score += (input.penaltiesMissed ?? 0) * FANTASY_RULES.penaltyMissed;
    score += (input.penaltiesSaved ?? 0) * FANTASY_RULES.penaltySaved;
    score += (input.ownGoals ?? 0) * FANTASY_RULES.ownGoal;
    score += input.yellowCards * FANTASY_RULES.yellowCard;
    score += input.redCards * FANTASY_RULES.redCard;

    if (input.position === 'goalkeeper') {
        const conceded = input.goalsConceded ?? 0;
        score += conceded * FANTASY_RULES.goalConceded;
        if (conceded === 0 && (input.minutes ?? 0) >= 60) score += FANTASY_RULES.cleanSheet;
    }

    return Math.round(score * 2) / 2 === score ? score : Math.round(score * 100) / 100;
}
