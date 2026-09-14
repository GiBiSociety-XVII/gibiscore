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

export interface VotoPair {
    rating: number;
    voto: number;
    role: FantaRole;
}

/** Pairs a role needs before its own line replaces the default. */
export const FIT_MIN_PAIRS = 120;

/**
 * The line through the official votes against the provider's ratings,
 * per role, by least squares; a role with too few pairs, or a line too
 * flat or too steep to be a scale, keeps the fallback.
 */
export function fitCalibration(pairs: VotoPair[], fallback: VotoCalibration = DEFAULT_CALIBRATION, min = FIT_MIN_PAIRS): VotoCalibration {
    const out = {...fallback};
    for (const role of ['P', 'D', 'C', 'A'] as FantaRole[]) {
        const own = pairs.filter((p) => p.role === role);
        if (own.length < min) continue;
        const n = own.length;
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
