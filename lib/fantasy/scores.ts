/**
 * Fantasy auction scores. Every player gets 1-100 marks on the things
 * that decide a fantasy price (starter reliability, bonus potential,
 * rating, malus, fitness, team) from the last three seasons, weighted
 * towards the current one, plus an overall mark by role and an
 * estimated "fantamedia". Pure and testable.
 */

export type FantaRole = 'P' | 'D' | 'C' | 'A';

export interface SeasonLine {
    year: number;
    leagueId: number;
    leagueName: string;
    teamId: number;
    teamName: string;
    /** Matches the league (or cup) had in that season: the baseline for the availability rate. */
    games: number;
    /** 1 for top leagues, lower for weaker ones: rates there count less. */
    level: number;
    appearances: number;
    lineups: number;
    bench: number;
    minutes: number;
    rating: number | null;
    goals: number;
    assists: number;
    penaltiesScored: number;
    penaltiesMissed: number;
    yellow: number;
    yellowRed: number;
    red: number;
    goalsConceded: number;
    saves: number;
}

export interface AuctionInput {
    role: FantaRole;
    age: number | null;
    currentYear: number;
    /** The club he plays for now: his lines there weigh double (a transfer changes the role in the team). */
    currentTeamId?: number | null;
    seasons: SeasonLine[];
    injury: {active: boolean; daysOut: number; longTerm: boolean} | null;
    /** 0..1, 0.5 = league average; null before the season has a shape. */
    teamAttack: number | null;
    teamDefence: number | null;
}

export interface FantaScores {
    /** How often the player starts (and finishes) the matches he is available for. */
    starter: number;
    /** Goals and assists per 90, relative to the role. */
    bonus: number;
    /** Average rating (lower leagues discounted). */
    rating: number;
    /** Few cards (goals conceded for keepers). Higher is better. */
    discipline: number;
    /** Availability: matches in the squad over the season, current injury, age. */
    fitness: number;
    /** Strength of the club this season. */
    team: number;
    overall: number;
    /** Estimated fantasy average per match played (rating + bonus - malus). */
    fantaAvg: number | null;
    /** Weighted matches behind the marks. */
    sample: number;
    confidence: 'low' | 'medium' | 'high';
}

const clamp = (v: number, min = 1, max = 100) => Math.max(min, Math.min(max, Math.round(v)));

/**
 * Season weights: the current season grows towards 50% as it goes (two
 * matches count ~1%, eight ~20%, fifteen or more 50%: a hot start does
 * not make a price), previous 40%, older 10%; missing seasons hand their
 * share to the others.
 */
export function seasonWeights(seasons: SeasonLine[], currentYear: number): Map<number, number> {
    const years = [...new Set(seasons.map((s) => s.year))].filter((y) => y <= currentYear && y >= currentYear - 2);
    const gamesOf = (y: number) => Math.max(0, ...seasons.filter((s) => s.year === y).map((s) => s.games));
    const raw = new Map<number, number>();
    for (const y of years) {
        const base = y === currentYear ? 0.5 * Math.min(1, gamesOf(y) / 15) ** 1.5 : y === currentYear - 1 ? 0.4 : 0.1;
        if (base > 0) raw.set(y, base);
    }
    const total = [...raw.values()].reduce((s, v) => s + v, 0);
    if (total === 0) return raw;
    for (const [y, w] of raw) raw.set(y, w / total);
    return raw;
}

interface YearAgg {
    /** Longest competition of the season (the league): the availability baseline. */
    games: number;
    apps: number;
    lineups: number;
    bench: number;
    minutes: number;
    /** Same, weighted towards the current club. */
    wApps: number;
    wLineups: number;
    wBench: number;
    wMinutes: number;
    ratingSum: number;
    ratingApps: number;
    goals: number;
    assists: number;
    penMissed: number;
    yellow: number;
    red: number;
    conceded: number;
    level: number;
}

/** One season across its competitions. Lines at the current club weigh double for the starter rates. */
function aggregateYear(lines: SeasonLine[], currentTeamId: number | null | undefined): YearAgg {
    const a: YearAgg = {games: 0, apps: 0, lineups: 0, bench: 0, minutes: 0, wApps: 0, wLineups: 0, wBench: 0, wMinutes: 0, ratingSum: 0, ratingApps: 0, goals: 0, assists: 0, penMissed: 0, yellow: 0, red: 0, conceded: 0, level: 0};
    let levelW = 0;
    for (const l of lines) {
        const w = currentTeamId !== null && currentTeamId !== undefined && l.teamId === currentTeamId ? 2 : 1;
        const level = 0.5 + 0.5 * l.level;
        a.games = Math.max(a.games, l.games);
        a.apps += l.appearances;
        a.lineups += l.lineups;
        a.bench += l.bench;
        a.minutes += l.minutes;
        a.wApps += w * l.appearances;
        a.wLineups += w * l.lineups;
        a.wBench += w * l.bench;
        a.wMinutes += w * l.minutes;
        if (l.rating !== null && l.appearances > 0) {
            // Ratings in weaker leagues are worth less: the excess over 6 is discounted.
            a.ratingSum += (6 + (l.rating - 6) * level) * l.appearances;
            a.ratingApps += l.appearances;
        }
        a.goals += l.goals;
        a.assists += l.assists;
        a.penMissed += l.penaltiesMissed;
        a.yellow += l.yellow;
        a.red += l.red + l.yellowRed;
        a.conceded += l.goalsConceded;
        a.level += l.level * Math.max(1, l.appearances);
        levelW += Math.max(1, l.appearances);
    }
    a.level = levelW > 0 ? a.level / levelW : 1;
    return a;
}

/** Bonus points per 90 (3 x goals + assists) that mark 100 for the role: an elite season. */
const BONUS_SCALE: Record<FantaRole, number> = {P: 0.1, D: 0.25, C: 0.55, A: 1.0};

const WEIGHTS: Record<FantaRole, Record<Exclude<keyof FantaScores, 'overall' | 'fantaAvg' | 'sample' | 'confidence'>, number>> = {
    P: {starter: 35, bonus: 0, rating: 25, discipline: 20, fitness: 10, team: 10},
    D: {starter: 30, bonus: 20, rating: 20, discipline: 10, fitness: 10, team: 10},
    C: {starter: 25, bonus: 35, rating: 15, discipline: 5, fitness: 10, team: 10},
    A: {starter: 25, bonus: 40, rating: 15, discipline: 5, fitness: 10, team: 5},
};

export function scorePlayer(input: AuctionInput): FantaScores {
    const weights = seasonWeights(input.seasons, input.currentYear);
    const years = [...weights.keys()];
    if (years.length === 0) {
        return {starter: 1, bonus: 1, rating: 1, discipline: 50, fitness: input.injury?.active ? 20 : 50, team: teamScore(input), overall: 1, fantaAvg: null, sample: 0, confidence: 'low'};
    }

    let starter = 0;
    let bonus = 0;
    let rating = 0;
    let ratingW = 0;
    let discipline = 0;
    let fitness = 0;
    let sample = 0;
    let fantaAvg = 0;
    let fantaW = 0;

    for (const y of years) {
        const w = weights.get(y)!;
        const a = aggregateYear(input.seasons.filter((s) => s.year === y), input.currentTeamId);
        const per90 = a.minutes > 0 ? 90 / a.minutes : 0;
        const levelFactor = 0.7 + 0.3 * a.level;

        // Starter: of the matches he was in the squad for, how many he started
        // and how much of them he played. A January transfer is judged on
        // both clubs, the current one counting double.
        const inSquad = Math.max(1, a.wApps + a.wBench);
        const startRate = Math.min(1, a.wLineups / inSquad);
        const minuteRate = Math.min(1, a.wMinutes / (inSquad * 90));
        starter += w * 100 * (0.6 * startRate + 0.4 * minuteRate) * levelFactor;

        // Bonus per 90 against the role's elite rate, saturating.
        const bonus90 = (3 * a.goals + a.assists) * per90 * a.level;
        bonus += w * 100 * (1 - Math.exp(-bonus90 / BONUS_SCALE[input.role]));

        // Rating: 5.6 -> 0, 7.3 -> 100.
        if (a.ratingApps > 0) {
            const avg = a.ratingSum / a.ratingApps;
            rating += w * 100 * Math.max(0, Math.min(1, (avg - 5.6) / 1.7));
            ratingW += w;
        }

        // Malus: cards (and goals conceded for keepers) per 90.
        if (input.role === 'P') {
            const conceded90 = a.minutes > 0 ? a.conceded * per90 : 1.4;
            discipline += w * 100 * Math.max(0, Math.min(1, (2.2 - conceded90) / 1.4));
        } else {
            const malus90 = a.minutes > 0 ? (0.5 * a.yellow + a.red + 3 * a.penMissed) * per90 : 0.15;
            discipline += w * 100 * Math.exp(-malus90 / 0.25);
        }

        // Fitness: matches in the squad (played or on the bench) over the league's season.
        fitness += w * 100 * Math.min(1, (a.apps + a.bench) / Math.max(1, a.games));

        sample += w * a.apps;

        if (a.ratingApps > 0 && a.apps > 0) {
            const malusPer = input.role === 'P' ? a.conceded / a.apps : 0;
            const perMatch = (3 * a.goals + a.assists - 0.5 * a.yellow - a.red - 3 * a.penMissed) / a.apps - malusPer;
            fantaAvg += w * (a.ratingSum / a.ratingApps + perMatch);
            fantaW += w;
        }
    }

    // Current injury and age weigh on fitness.
    if (input.injury?.active) fitness = input.injury.longTerm ? Math.min(fitness, 20) : fitness - Math.min(35, 15 + input.injury.daysOut / 3);
    if (input.age !== null && input.age >= 33) fitness -= (input.age - 32) * 4;

    const scores = {
        starter: clamp(starter),
        bonus: clamp(bonus),
        rating: ratingW > 0 ? clamp(rating / ratingW) : 1,
        discipline: clamp(discipline),
        fitness: clamp(fitness),
        team: teamScore(input),
    };
    const w = WEIGHTS[input.role];
    const overall = (Object.keys(w) as Array<keyof typeof w>).reduce((s, k) => s + (scores[k] * w[k]) / 100, 0);
    // Thin evidence pulls the overall towards the middle-low range.
    const evidence = Math.min(1, sample / 15);
    const games = Math.round(sample);
    return {
        ...scores,
        overall: clamp(overall * evidence + 30 * (1 - evidence)),
        fantaAvg: fantaW > 0 ? Math.round((fantaAvg / fantaW) * 100) / 100 : null,
        sample: games,
        confidence: games >= 20 ? 'high' : games >= 8 ? 'medium' : 'low',
    };
}

/** Club strength for the role, compressed to 20..80: it is one factor, not the whole story. */
function teamScore(input: AuctionInput): number {
    const attack = input.teamAttack;
    const defence = input.teamDefence;
    if (attack === null && defence === null) return 50;
    const mix = input.role === 'A' ? [0.8, 0.2] : input.role === 'C' ? [0.6, 0.4] : input.role === 'D' ? [0.35, 0.65] : [0.15, 0.85];
    const a = attack ?? 0.5;
    const d = defence ?? 0.5;
    return clamp(50 + (mix[0] * a + mix[1] * d - 0.5) * 60);
}

// ---------------------------------------------------------------------------
// Suggested prices
// ---------------------------------------------------------------------------

export interface PriceConfig {
    credits: number;
    participants: number;
    /** Slots per role for each participant. */
    slots: Record<FantaRole, number>;
    /** Share of the total budget that usually goes to each role. */
    roleShare: Record<FantaRole, number>;
}

/**
 * Price curve down the ranking of a role: a short plateau at the very
 * top, then a steady fall (a Hill curve, 1 / (1 + (rank / half)^2),
 * "half" is the rank that costs half the top price). Tuned on 8-team,
 * 500-credit Serie A auctions: the first attacker about a third of one
 * budget, the fifth three quarters of that, the twelfth a third, the
 * twenty-fourth a tenth; keepers fall much faster (two or three
 * matter), defenders and midfielders are a little flatter.
 */
const RANK_HALF: Record<FantaRole, number> = {P: 3.5, D: 9, C: 8, A: 8};

/**
 * Suggested credits per player. Each role gets its share of the market
 * (attackers cost the most, then midfielders, defenders, keepers); inside
 * the role prices follow the ranking with the role's curve, adjusted by
 * how far a player's mark sits from the top mark, so a clear number one
 * costs more than a crowded top. Only the players that will actually be
 * bought (participants x slots) share the money; everyone else is 1.
 */
export function suggestPrices<T extends {id: number; role: FantaRole; scores: Pick<FantaScores, 'overall'>}>(players: T[], config: PriceConfig): Map<number, number> {
    const prices = new Map<number, number>();
    const market = config.credits * config.participants;
    for (const role of ['P', 'D', 'C', 'A'] as const) {
        const pool = players.filter((p) => p.role === role).sort((a, b) => b.scores.overall - a.scores.overall);
        const bought = pool.slice(0, Math.max(1, config.participants * config.slots[role]));
        const budget = market * config.roleShare[role];
        const top = bought[0]?.scores.overall ?? 1;
        const weight = (p: T, rank: number) => (1 / (1 + (rank / RANK_HALF[role]) ** 2)) * (0.6 + 0.4 * (p.scores.overall / top) ** 2);
        for (const p of pool) prices.set(p.id, 1);
        // Nobody pays more than 40% of a single budget: what a capped player
        // leaves on the table goes to the others, a few passes until stable.
        const cap = Math.max(1, Math.round(config.credits * 0.4));
        const fixed = new Map<number, number>();
        const rankOf = new Map(bought.map((p, i) => [p.id, i]));
        for (let pass = 0; pass < 6; pass += 1) {
            const open = bought.filter((p) => !fixed.has(p.id));
            const total = open.reduce((s, p) => s + weight(p, rankOf.get(p.id) ?? 0), 0);
            if (open.length === 0 || total === 0) break;
            const rest = Math.max(0, budget - [...fixed.values()].reduce((s, v) => s + v, 0) - open.length);
            let capped = false;
            for (const p of open) {
                const price = Math.max(1, Math.round(1 + (rest * weight(p, rankOf.get(p.id) ?? 0)) / total));
                if (price > cap) {
                    fixed.set(p.id, cap);
                    capped = true;
                } else prices.set(p.id, price);
            }
            if (!capped) break;
        }
        for (const [id, price] of fixed) prices.set(id, price);
    }
    return prices;
}
