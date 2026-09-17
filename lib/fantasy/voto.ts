import type {FantaRole} from './scores';

/**
 * The provider's match ratings (API-Football, an Opta-like 1..10 scale)
 * are not fantasy votes: in Serie A a starter averages about 6.9 there
 * against about 6.05 in the newspapers' votes the fantasy game uses, and
 * they spread wider. Everything fantasy-side runs on the vote scale, so
 * a rating is mapped to a vote by role: a line fitted on the official
 * votes when enough of them are in, these defaults until then (drawn
 * from the ratings of the last two Serie A seasons against the usual
 * distribution of the votes).
 */

export interface RoleCalibration {
    /** voto = intercept + slope × rating */
    slope: number;
    intercept: number;
}

export type VotoCalibration = Record<FantaRole, RoleCalibration>;

/** Serie A ratings (60+ minutes): keepers 7.0 ± 0.78, defenders 6.85 ± 0.56, midfielders 6.93 ± 0.6, attackers 6.87 ± 0.73. Votes: about 6.05 ± 0.45 (keepers 6.1 ± 0.5, attackers ± 0.5). */
export const DEFAULT_CALIBRATION: VotoCalibration = {
    P: {slope: 0.64, intercept: 6.1 - 0.64 * 7.0},
    D: {slope: 0.8, intercept: 6.05 - 0.8 * 6.85},
    C: {slope: 0.75, intercept: 6.05 - 0.75 * 6.93},
    A: {slope: 0.68, intercept: 6.05 - 0.68 * 6.87},
};

/** A rating on the vote scale. */
export function toVoto(rating: number, role: FantaRole, calibration: VotoCalibration = DEFAULT_CALIBRATION): number {
    const c = calibration[role];
    return Math.round((c.intercept + c.slope * rating) * 100) / 100;
}

/** Votes come in half points: 6, 6.5, 7. */
export const halfVoto = (voto: number): number => Math.round(voto * 2) / 2;

/** Minutes under which the provider's rating is not taken as a vote (the newspaper gives none: "s.v."). */
export const VOTE_MINUTES = 10;

/** The fantasy role of a provider position ("goalkeeper", or "G" in a lineup); a midfielder when unknown. */
export function roleOfPosition(position: string | null | undefined): FantaRole {
    switch ((position ?? '').toLowerCase()) {
        case 'goalkeeper':
        case 'g':
            return 'P';
        case 'defender':
        case 'd':
            return 'D';
        case 'attacker':
        case 'f':
            return 'A';
        default:
            return 'C';
    }
}

/** A match rating shown as the vote it stands for: on the vote scale of the role, in half points. */
export function matchVoto(rating: number, position: string | null | undefined, calibration: VotoCalibration = DEFAULT_CALIBRATION): number {
    return halfVoto(toVoto(rating, roleOfPosition(position), calibration));
}

/**
 * The vote a match line shows, or none: a rating of zero is no rating
 * (the provider's placeholder for whoever did not play), fewer than
 * VOTE_MINUTES on the pitch is "s.v." as in the newspapers. Minutes
 * unknown: the rating alone decides.
 */
export function shownVoto(rating: number | null | undefined, minutes: number | null | undefined, position: string | null | undefined, calibration: VotoCalibration = DEFAULT_CALIBRATION): number | null {
    if (rating === null || rating === undefined || rating <= 0) return null;
    if (minutes !== null && minutes !== undefined && minutes < VOTE_MINUTES) return null;
    return matchVoto(rating, position, calibration);
}

/** An average of ratings shown as an average of votes: on the vote scale of the role, two decimals. */
export function meanVoto(rating: number, position: string | null | undefined, calibration: VotoCalibration = DEFAULT_CALIBRATION): number {
    return toVoto(rating, roleOfPosition(position), calibration);
}

/** From this vote up a match was a good one (the provider's 7 on its own scale). */
export const GOOD_VOTO = 6.5;

export interface VotoPair {
    rating: number;
    voto: number;
    role: FantaRole;
}

/** Pairs a role needs before its own line replaces the default. */
export const FIT_MIN_PAIRS = 120;
/** With fewer pairs only the level moves: the mean gap to the fallback's line, weighted n ÷ (n + this). */
export const SHRINK_PAIRS = 10;

/**
 * The line through the official votes against the provider's ratings,
 * per role, by least squares; a role with too few pairs only moves the
 * fallback's level (see SHRINK_PAIRS), a line too flat or too steep to
 * be a scale keeps the fallback whole.
 */
export function fitCalibration(pairs: VotoPair[], fallback: VotoCalibration = DEFAULT_CALIBRATION, min = FIT_MIN_PAIRS): VotoCalibration {
    const out = {...fallback};
    for (const role of ['P', 'D', 'C', 'A'] as FantaRole[]) {
        const own = pairs.filter((p) => p.role === role);
        const n = own.length;
        if (n === 0) continue;
        if (n < min) {
            // A handful of votes (typed in by hand, say) cannot fit a line, but they say whether the
            // fallback runs high or low: its level moves by the mean gap, shrunk towards zero.
            const gap = own.reduce((s, p) => s + (p.voto - (fallback[role].intercept + fallback[role].slope * p.rating)), 0) / n;
            out[role] = {slope: fallback[role].slope, intercept: Math.round((fallback[role].intercept + gap * (n / (n + SHRINK_PAIRS))) * 1000) / 1000};
            continue;
        }
        const mx = own.reduce((s, p) => s + p.rating, 0) / n;
        const my = own.reduce((s, p) => s + p.voto, 0) / n;
        const sxx = own.reduce((s, p) => s + (p.rating - mx) ** 2, 0);
        const sxy = own.reduce((s, p) => s + (p.rating - mx) * (p.voto - my), 0);
        if (sxx <= 0) continue;
        const slope = sxy / sxx;
        if (slope < 0.35 || slope > 1.2) continue;
        out[role] = {slope: Math.round(slope * 1000) / 1000, intercept: Math.round((my - slope * mx) * 1000) / 1000};
    }
    return out;
}
