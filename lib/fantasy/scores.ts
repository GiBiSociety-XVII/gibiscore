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
    /** Keepers. */
    penaltiesSaved: number;
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
    /** Rounds the club has played this season: the shape counts as "team" from five, as "form" from the first. */
    teamRounds?: number;
}

export interface FantaScores {
    /** How often the player starts (and finishes) the matches he is available for. */
    starter: number;
    /** Goals and assists per 90, relative to the role. Keepers: clean sheets and penalties saved. */
    bonus: number;
    /** Average rating (lower leagues discounted). */
    rating: number;
    /** Few cards (goals conceded for keepers). Higher is better. */
    discipline: number;
    /** Availability: matches in the squad over the season, current injury, age. */
    fitness: number;
    /** Strength of the club this season. */
    team: number;
    /** How the season has started for him and his club, against his own past: 50 = as expected. */
    form: number;
    overall: number;
    /** Estimated fantasy average per match played (rating + bonus - malus). */
    fantaAvg: number | null;
    /** Weighted matches behind the marks. */
    sample: number;
    confidence: 'low' | 'medium' | 'high';
}

const clamp = (v: number, min = 1, max = 100) => Math.max(min, Math.min(max, Math.round(v)));

/**
 * Season weights. Auctions happen in early September and early January,
 * so the previous season is the backbone (55%) and the one before it
 * counts 15%; the current season starts small and grows with the
 * matches played: 5% after two rounds, 20% after eight, 45% by January
 * (nineteen rounds). How the player and his club have started is a
 * separate mark ("form"), not a bigger weight.
 */
export function seasonWeights(seasons: SeasonLine[], currentYear: number): Map<number, number> {
    const years = [...new Set(seasons.map((s) => s.year))].filter((y) => y <= currentYear && y >= currentYear - 2);
    const gamesOf = (y: number) => Math.max(0, ...seasons.filter((s) => s.year === y).map((s) => s.games));
    const raw = new Map<number, number>();
    for (const y of years) {
        const base = y === currentYear ? 0.6 * Math.min(1, gamesOf(y) / 19) ** 1.2 : y === currentYear - 1 ? 0.55 : 0.15;
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
    penSaved: number;
    yellow: number;
    red: number;
    conceded: number;
    level: number;
}

/** One season across its competitions. Lines at the current club weigh double for the starter rates. */
function aggregateYear(lines: SeasonLine[], currentTeamId: number | null | undefined): YearAgg {
    const a: YearAgg = {games: 0, apps: 0, lineups: 0, bench: 0, minutes: 0, wApps: 0, wLineups: 0, wBench: 0, wMinutes: 0, ratingSum: 0, ratingApps: 0, goals: 0, assists: 0, penMissed: 0, penSaved: 0, yellow: 0, red: 0, conceded: 0, level: 0};
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
        a.penSaved += l.penaltiesSaved;
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
    P: {starter: 30, bonus: 14, rating: 20, discipline: 10, fitness: 8, team: 9, form: 9},
    D: {starter: 27, bonus: 18, rating: 18, discipline: 9, fitness: 8, team: 9, form: 11},
    C: {starter: 22, bonus: 32, rating: 14, discipline: 4, fitness: 8, team: 9, form: 11},
    A: {starter: 22, bonus: 36, rating: 14, discipline: 4, fitness: 8, team: 5, form: 11},
};

export function scorePlayer(input: AuctionInput): FantaScores {
    const weights = seasonWeights(input.seasons, input.currentYear);
    const years = [...weights.keys()];
    if (years.length === 0) {
        return {starter: 1, bonus: 1, rating: 1, discipline: 50, fitness: input.injury?.active ? 20 : 50, team: teamScore(input), form: 50, overall: 1, fantaAvg: null, sample: 0, confidence: 'low'};
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

        if (input.role === 'P') {
            // Keepers do not score: their bonus is the clean sheet and the penalty saved. With goals
            // conceded per 90 as a Poisson rate, the chance of a clean sheet is exp(-rate): 0.9 a match
            // (an elite season) gives 41%, 1.4 (average) 25%, 1.9 (a sieve) 15%. A penalty saved every
            // twenty matches adds a few points.
            const conceded90 = a.minutes > 0 ? a.conceded * per90 / Math.max(0.6, a.level) : 1.4;
            const cleanSheet = Math.exp(-conceded90);
            const penSaved90 = a.minutes > 0 ? a.penSaved * per90 : 0;
            bonus += w * 100 * Math.min(1, Math.max(0, (cleanSheet - 0.1) / 0.35) + Math.min(0.15, penSaved90 * 3));
        } else {
            // Bonus per 90 against the role's elite rate, saturating.
            const bonus90 = (3 * a.goals + a.assists) * per90 * a.level;
            bonus += w * 100 * (1 - Math.exp(-bonus90 / BONUS_SCALE[input.role]));
        }

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
            // Keepers: a goal conceded costs one, a clean sheet earns one, a penalty saved three.
            const keeper = input.role === 'P' ? -a.conceded / a.apps + Math.exp(-(a.minutes > 0 ? a.conceded * per90 : 1.4)) + (3 * a.penSaved) / a.apps : 0;
            const perMatch = (3 * a.goals + a.assists - 0.5 * a.yellow - a.red - 3 * a.penMissed) / a.apps + keeper;
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
        form: formScore(input),
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

/** Attack/defence mix of the club for the role, 0..1 (0.5 average). */
function clubMix(input: AuctionInput): number | null {
    const attack = input.teamAttack;
    const defence = input.teamDefence;
    if (attack === null && defence === null) return null;
    const mix = input.role === 'A' ? [0.8, 0.2] : input.role === 'C' ? [0.6, 0.4] : input.role === 'D' ? [0.35, 0.65] : [0.15, 0.85];
    return mix[0] * (attack ?? 0.5) + mix[1] * (defence ?? 0.5);
}

/** Club strength for the role, compressed to 20..80, only once the club has played five rounds. */
function teamScore(input: AuctionInput): number {
    const mix = clubMix(input);
    if (mix === null || (input.teamRounds ?? 5) < 5) return 50;
    return clamp(50 + (mix - 0.5) * 60);
}

/**
 * Start of the season against the player's own past: is he starting,
 * is he rating and scoring above or below his previous season, how has
 * his club started. Half weight after two rounds, full after four; 50
 * when nothing has been played yet.
 */
function formScore(input: AuctionInput): number {
    const cur = input.seasons.filter((s) => s.year === input.currentYear);
    const past = input.seasons.filter((s) => s.year === input.currentYear - 1);
    const rounds = Math.max(input.teamRounds ?? 0, ...cur.map((s) => s.games));
    if (rounds < 1) return 50;
    const now = aggregateYear(cur, input.currentTeamId);
    const before = aggregateYear(past, input.currentTeamId);
    let delta = 0;

    // Playing? Starts over the club's rounds, against last season's starting rate.
    const startNow = Math.min(1, now.lineups / rounds);
    const startBefore = before.apps + before.bench > 0 ? before.lineups / (before.apps + before.bench) : 0.5;
    delta += Math.max(-15, Math.min(15, (startNow - startBefore) * 40));
    // Not seen at all while the club has played: bad sign unless injured.
    if (now.apps === 0 && rounds >= 2 && !input.injury?.active) delta -= 12;

    if (now.ratingApps > 0 && before.ratingApps > 0) {
        delta += Math.max(-12, Math.min(12, (now.ratingSum / now.ratingApps - before.ratingSum / before.ratingApps) * 20));
    }
    if (now.minutes > 0 && before.minutes > 0) {
        const bonusNow = ((3 * now.goals + now.assists) * 90) / now.minutes;
        const bonusBefore = ((3 * before.goals + before.assists) * 90) / before.minutes;
        delta += Math.max(-12, Math.min(12, ((bonusNow - bonusBefore) / BONUS_SCALE[input.role]) * 10));
    }

    // The club's start, softly until it has played a few rounds.
    const mix = clubMix(input);
    if (mix !== null) delta += (mix - 0.5) * 40 * Math.min(1, rounds / 5);

    // Two rounds are half a signal, four a full one.
    return clamp(50 + delta * Math.min(1, rounds / 4));
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

/** What the pricing reads of a player: the marks, or just the overall when the rest is unknown. */
export interface PricedScores extends Pick<FantaScores, 'overall'>, Partial<Pick<FantaScores, 'fantaAvg' | 'starter' | 'fitness' | 'form' | 'sample' | 'confidence'>> {}

export interface PriceablePlayer {
    id: number;
    role: FantaRole;
    age?: number | null;
    scores: PricedScores;
}

/** Typical fantamedia of a starter in the role: the fallback when a player has no estimate. */
const ROLE_FANTA: Record<FantaRole, number> = {P: 5.7, D: 6.05, C: 6.2, A: 6.5};
/**
 * Tuning of the value model. `power`: scarcity, a player worth twice as
 * much over the replacement costs 2^power times more. `freeGap`: what a
 * free player brings below his fantamedia, since he does not play every
 * week and is fielded only when the starter is out.
 */
export const PRICE_TUNING = {power: 2, freeGap: 0.35, tail: 1.2};

/**
 * What a player is expected to bring over the free alternative, per
 * match: his fantamedia over the replacement level of the role, times
 * the chance he actually plays, plus an upside for the ones who may
 * grow into a starter (young, hot start, thin evidence). The fantamedia
 * of players with few matches is shrunk towards the role's level. Pure
 * numbers, no fixed prices anywhere: the money then follows this value.
 */
/** Fantamedia shrunk towards the role's level when it rests on few matches. */
function shrunkFanta(p: PriceablePlayer, roleLevel: number): number {
    const sample = p.scores.sample ?? 30;
    const shrink = sample / (sample + 8);
    const raw = p.scores.fantaAvg ?? roleLevel + (p.scores.overall - 50) / 30;
    return raw * shrink + roleLevel * (1 - shrink);
}

export function expectedValue(p: PriceablePlayer, replacement: number, roleLevel: number): number {
    const fm = shrunkFanta(p, roleLevel);
    const play = Math.max(0, Math.min(1, (p.scores.starter ?? Math.min(100, p.scores.overall + 5)) / 100));
    const young = p.age !== null && p.age !== undefined && p.age <= 23;
    const hot = (p.scores.form ?? 50) >= 60;
    const thin = p.scores.confidence !== undefined && p.scores.confidence !== 'high';
    const upside = Math.min(0.45, 0.1 + (young ? 0.2 : 0) + (hot ? 0.1 : 0) + (thin ? 0.1 : 0));
    const avail = 0.4 + (0.6 * (p.scores.fitness ?? 70)) / 100;
    return Math.max(0, fm - replacement) * (play + (1 - play) * upside) * avail;
}

/**
 * Value weights of a role's players: the expected value over the
 * replacement level, raised to the scarcity power. The replacement is
 * the level of the last player the league buys (`count` of them), so
 * everyone below is worth nothing on the market. Pure.
 */
export function valueWeights<T extends PriceablePlayer>(players: T[], role: FantaRole, count: number): Map<number, number> {
    const pool = players.filter((p) => p.role === role);
    const level = ROLE_FANTA[role];
    // A first pass with the role's typical level finds the order, the replacement is read off it.
    const first = pool.map((p) => [p, expectedValue(p, 0, level)] as const).sort((a, b) => b[1] - a[1]);
    // The free alternative: the players just outside what the league buys, at their (shrunk)
    // fantamedia less what a bench player loses by not playing every week.
    const free = first.slice(Math.min(first.length - 1, Math.max(0, count)), Math.max(1, Math.round(count * 1.5))).map(([p]) => shrunkFanta(p, level));
    const replacement = free.length > 0 ? free.reduce((s, v) => s + v, 0) / free.length - PRICE_TUNING.freeGap : level - PRICE_TUNING.freeGap;
    const out = new Map<number, number>();
    for (const p of pool) out.set(p.id, expectedValue(p, replacement, level) ** PRICE_TUNING.power);
    return out;
}

export function suggestPrices<T extends PriceablePlayer>(players: T[], config: PriceConfig): Map<number, number> {
    const prices = new Map<number, number>();
    const market = config.credits * config.participants;
    for (const role of ['P', 'D', 'C', 'A'] as const) {
        const pool = players.filter((p) => p.role === role);
        const bought = Math.max(1, config.participants * config.slots[role]);
        const weights = valueWeights(pool, role, bought);
        // Priced: what the league buys plus the players just outside, who go for a few credits.
        const priced = [...pool].sort((a, b) => (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0)).slice(0, Math.max(1, Math.round(bought * PRICE_TUNING.tail)));
        const budget = market * config.roleShare[role];
        for (const p of pool) prices.set(p.id, 1);
        // No fixed ceiling: a price is what the market money and the value say, bounded only by
        // what one manager can physically pay while keeping a credit for every other slot of the
        // roster. What a bounded player leaves on the table goes to the others, a few passes until stable.
        const rosterSlots = config.slots.P + config.slots.D + config.slots.C + config.slots.A;
        const cap = Math.max(1, config.credits - (rosterSlots - 1));
        const fixed = new Map<number, number>();
        for (let pass = 0; pass < 6; pass += 1) {
            const open = priced.filter((p) => !fixed.has(p.id));
            const total = open.reduce((s, p) => s + (weights.get(p.id) ?? 0), 0);
            if (open.length === 0 || total === 0) break;
            const rest = Math.max(0, budget - [...fixed.values()].reduce((s, v) => s + v, 0) - open.length);
            let capped = false;
            for (const p of open) {
                const price = Math.max(1, Math.round(1 + (rest * (weights.get(p.id) ?? 0)) / total));
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
