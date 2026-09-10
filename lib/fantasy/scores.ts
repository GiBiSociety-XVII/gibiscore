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
    /** A cup: rotation there says half as much about his place in the league side. */
    cup?: boolean;
    /** Strength of the club he played this line for, 0..1 on the top league's scale (see AuctionInput.clubStrength); null when unknown. */
    clubStrength?: number | null;
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
    /**
     * Goals the current club concedes per match (last season and this one). Goals conceded
     * belong to the club, not the keeper: what he let in elsewhere is replaced by this rate.
     */
    clubConcededPer90?: number | null;
    /**
     * Strength of the current club, 0..1 on the top league's scale: 0.9 a title
     * contender, 0.5 mid-table, 0.1 a relegation side, ~0.3 a promoted club. Goals
     * and assists follow the club: a striker moving up or down the table is expected
     * to score more or less than his numbers say.
     */
    clubStrength?: number | null;
    /**
     * This season at the current club, from the lineups: matches started and
     * matches on the bench. What the coach actually does outweighs any history
     * once a few rounds are in: a keeper on the bench for three rounds is the
     * backup, whatever he was elsewhere.
     */
    thisSeason?: {starts: number; benches: number} | null;
}

/** Per match played: the rating and the events a league pays or fines. Keepers: goals conceded and the chance of a clean sheet. */
export interface FantaEvents {
    rating: number;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    penaltyMissed: number;
    penaltySaved: number;
    conceded: number;
    cleanSheet: number;
}

/** What a league pays per event (config.ts ScoringRules has the same shape). */
export interface FantaRules {
    goal: number;
    assist: number;
    goalConceded: number;
    yellow: number;
    red: number;
    penaltyMissed: number;
    penaltySaved: number;
    cleanSheet: number;
}

export const CLASSIC_RULES: FantaRules = {goal: 3, assist: 1, goalConceded: -1, yellow: -0.5, red: -1, penaltyMissed: -3, penaltySaved: 3, cleanSheet: 1};

/** The fantasy average per match under a league's rules, from the events. */
export function fantaAvgFor(events: FantaEvents, role: FantaRole, rules: FantaRules): number {
    const keeper = role === 'P' ? events.conceded * rules.goalConceded + events.cleanSheet * rules.cleanSheet + events.penaltySaved * rules.penaltySaved : 0;
    const value = events.rating + events.goals * rules.goal + events.assists * rules.assist + events.yellow * rules.yellow + events.red * rules.red + events.penaltyMissed * rules.penaltyMissed + keeper;
    return Math.round(value * 100) / 100;
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
    /** Estimated fantasy average per match played (rating + bonus - malus), with the classic rules. */
    fantaAvg: number | null;
    /** What he does per match played, translated to this league and club: the fantasy average under any rules (`fantaAvgFor`). */
    events: FantaEvents | null;
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

/**
 * What a line earned elsewhere, translated to the top league and to the
 * current club. Goals and assists in a weaker league come at a discount
 * that grows with the gap (Serie B: about 55%, a minor league 45%); the
 * excess of a rating over 6 is scaled by the level of the league. A club
 * near the top creates more chances than one near the bottom: the bonus
 * follows the ratio of the two clubs' strengths, within reason.
 */
export function bonusFactor(level: number): number {
    return Math.max(0.2, Math.min(1, level)) ** 1.6;
}

/** Strength assumed for a club when nobody told us: the middle of its league, on the top league's scale. */
export function defaultClubStrength(level: number): number {
    return 0.5 * Math.max(0.2, Math.min(1, level));
}

/** Chances a club creates, relative to an average top-league side. */
function clubBonus(strength: number): number {
    return 0.7 + 0.6 * Math.max(0, Math.min(1, strength));
}

/** How the current club changes what a line's club allowed: 0.6..1.5. */
export function clubRatio(current: number | null | undefined, line: number | null | undefined, level: number): number {
    if (current === null || current === undefined) return 1;
    // A club we know nothing about (abroad) is taken as average, and the ratio kept modest.
    if (line === null || line === undefined) return Math.max(0.7, Math.min(1.15, clubBonus(current) / clubBonus(defaultClubStrength(level))));
    return Math.max(0.6, Math.min(1.5, clubBonus(current) / clubBonus(line)));
}

interface YearAgg {
    /** Longest competition of the season (the league): the availability baseline. */
    games: number;
    /** League lines of the year, and the matches he was in the squad for in them (cups rotate). */
    leagueLines: number;
    inSquadLeague: number;
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
    /** Goals and assists translated to the top league and the current club: what they would be worth here. */
    tGoals: number;
    tAssists: number;
    penMissed: number;
    penSaved: number;
    yellow: number;
    red: number;
    conceded: number;
    level: number;
    /** Matches in the squad at the current club (played or on the bench). */
    atClub: number;
}

/** One season across its competitions. Lines at the current club weigh double for the starter rates. */
function aggregateYear(lines: SeasonLine[], currentTeamId: number | null | undefined, clubConcededPer90: number | null = null, clubStrength: number | null = null): YearAgg {
    const a: YearAgg = {games: 0, apps: 0, lineups: 0, bench: 0, minutes: 0, wApps: 0, wLineups: 0, wBench: 0, wMinutes: 0, ratingSum: 0, ratingApps: 0, goals: 0, assists: 0, tGoals: 0, tAssists: 0, penMissed: 0, penSaved: 0, yellow: 0, red: 0, conceded: 0, level: 0, atClub: 0, leagueLines: 0, inSquadLeague: 0};
    let levelW = 0;
    for (const l of lines) {
        const atClub = currentTeamId !== null && currentTeamId !== undefined && l.teamId === currentTeamId;
        // The current club counts double, a cup half: rotation in Europe is not rotation in the league.
        const w = (atClub ? 2 : 1) * (l.cup ? 0.5 : 1);
        const level = Math.max(0.2, Math.min(1, l.level));
        // Translation of what he did there to here: the league's gap and the two clubs' strengths.
        const ratio = atClub ? 1 : clubRatio(clubStrength, l.clubStrength, l.level);
        const transfer = bonusFactor(l.level) * ratio;
        const ratingShift = !atClub && clubStrength !== null && clubStrength !== undefined ? Math.max(-0.15, Math.min(0.15, 0.3 * (clubStrength - (l.clubStrength ?? defaultClubStrength(l.level))))) : 0;
        if (atClub) a.atClub += l.lineups + l.bench;
        if (!l.cup) {
            a.leagueLines += 1;
            a.inSquadLeague += l.lineups + l.bench;
        }
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
            // Ratings in weaker leagues are worth less: the excess over 6 is scaled by the league's level.
            a.ratingSum += (6 + (l.rating - 6) * level + ratingShift) * l.appearances;
            a.ratingApps += l.appearances;
        }
        a.goals += l.goals;
        a.assists += l.assists;
        a.tGoals += l.goals * transfer;
        a.tAssists += l.assists * transfer;
        a.penMissed += l.penaltiesMissed;
        a.penSaved += l.penaltiesSaved;
        a.yellow += l.yellow;
        a.red += l.red + l.yellowRed;
        // Goals conceded belong to the club: elsewhere they are replaced by what the current club
        // concedes; his own, in a weaker league, would be more here.
        a.conceded += !atClub && clubConcededPer90 !== null ? (clubConcededPer90 * l.minutes) / 90 : l.goalsConceded / Math.max(0.6, level);
        // How sure his place is: a starter in a weaker league may not start here, unless it is his club.
        a.level += (atClub ? 1 : l.level) * Math.max(1, l.appearances);
        levelW += Math.max(1, l.appearances);
    }
    a.level = levelW > 0 ? a.level / levelW : 1;
    return a;
}

/** Minutes a rate per 90 is measured over at least (six full matches); a rating average is filled up to them too. */
const RATE_MINUTES = 540;
/** Goals conceded per 90 by an average side, for a keeper's missing minutes when his club's rate is unknown. */
const TYPICAL_CONCEDED = 1.4;

/** Bonus points per 90 (3 x goals + assists) of the role's scale: the saturating curve marks 63 there, ~90 at twice that (an elite season). */
const BONUS_SCALE: Record<FantaRole, number> = {P: 0.1, D: 0.25, C: 0.55, A: 1.0};

const WEIGHTS: Record<FantaRole, Record<Exclude<keyof FantaScores, 'overall' | 'fantaAvg' | 'events' | 'sample' | 'confidence'>, number>> = {
    P: {starter: 30, bonus: 14, rating: 20, discipline: 10, fitness: 8, team: 9, form: 9},
    D: {starter: 27, bonus: 18, rating: 18, discipline: 9, fitness: 8, team: 9, form: 11},
    C: {starter: 22, bonus: 32, rating: 14, discipline: 4, fitness: 8, team: 9, form: 11},
    A: {starter: 22, bonus: 36, rating: 14, discipline: 4, fitness: 8, team: 5, form: 11},
};

export function scorePlayer(input: AuctionInput): FantaScores {
    const weights = seasonWeights(input.seasons, input.currentYear);
    const years = [...weights.keys()];
    if (years.length === 0) {
        return {starter: 1, bonus: 1, rating: 1, discipline: 50, fitness: input.injury?.active ? 20 : 50, team: teamScore(input), form: 50, overall: 1, fantaAvg: null, events: null, sample: 0, confidence: 'low'};
    }

    let starter = 0;
    let bonus = 0;
    let bonusW = 0;
    let rating = 0;
    let ratingW = 0;
    let discipline = 0;
    let disciplineW = 0;
    let fitness = 0;
    let sample = 0;
    let fantaW = 0;
    const events: FantaEvents = {rating: 0, goals: 0, assists: 0, yellow: 0, red: 0, penaltyMissed: 0, penaltySaved: 0, conceded: 0, cleanSheet: 0};

    for (const y of years) {
        const w = weights.get(y)!;
        const a = aggregateYear(input.seasons.filter((s) => s.year === y), input.currentTeamId, input.clubConcededPer90 ?? null, input.clubStrength ?? null);
        // Rates per 90 are measured over at least six full matches: a goal in the twenty minutes of
        // a substitute is not a goal a match. A keeper's missing minutes concede at his club's rate.
        const per90 = a.minutes > 0 ? 90 / Math.max(a.minutes, RATE_MINUTES) : 0;
        const missing = a.minutes > 0 ? Math.max(0, RATE_MINUTES - a.minutes) : 0;
        const levelFactor = 0.7 + 0.3 * a.level;

        // Starter: of the matches he was in the squad for (started, or on the
        // bench: an appearance from the bench is counted there too), how many
        // he started and how much of them he played. A January transfer is
        // judged on both clubs, the current one counting double.
        const inSquad = Math.max(1, a.wLineups + a.wBench);
        const startRate = Math.min(1, a.wLineups / inSquad);
        const minuteRate = Math.min(1, a.wMinutes / (inSquad * 90));
        starter += w * 100 * (0.6 * startRate + 0.4 * minuteRate) * levelFactor;

        // A year without a minute on the pitch says nothing about bonus and malus: it is left out
        // of those two marks (as of the rating), and shows in starter, fitness and the sample.
        const conceded90 = (a.conceded + ((input.clubConcededPer90 ?? TYPICAL_CONCEDED) * missing) / 90) * per90;
        const cleanSheet = Math.exp(-conceded90);
        if (a.minutes > 0) {
            if (input.role === 'P') {
                // Keepers do not score: their bonus is the clean sheet and the penalty saved. With goals
                // conceded per 90 as a Poisson rate, the chance of a clean sheet is exp(-rate): 0.9 a match
                // (an elite season) gives 41%, 1.4 (average) 25%, 1.9 (a sieve) 15%. A penalty saved every
                // twenty matches adds a few points.
                const penSaved90 = a.penSaved * per90;
                bonus += w * 100 * Math.min(1, Math.max(0, (cleanSheet - 0.1) / 0.35) + Math.min(0.15, penSaved90 * 3));
            } else {
                // Bonus per 90 (translated to this league and club) against the role's elite rate, saturating.
                const bonus90 = (3 * a.tGoals + a.tAssists) * per90;
                bonus += w * 100 * (1 - Math.exp(-bonus90 / BONUS_SCALE[input.role]));
            }
            bonusW += w;
        }

        // Rating: 5.6 -> 0, 7.3 -> 100.
        if (a.ratingApps > 0) {
            // Filled up to six full matches with sixes: two good ratings in a few minutes are not a season.
            const filler = missing / 90;
            const avg = (a.ratingSum + 6 * filler) / (a.ratingApps + filler);
            rating += w * 100 * Math.max(0, Math.min(1, (avg - 5.6) / 1.7));
            ratingW += w;
        }

        // Malus: cards (and goals conceded for keepers) per 90.
        if (a.minutes > 0) {
            if (input.role === 'P') {
                discipline += w * 100 * Math.max(0, Math.min(1, (2.2 - conceded90) / 1.4));
            } else {
                const malus90 = (0.5 * a.yellow + a.red + 3 * a.penMissed) * per90;
                discipline += w * 100 * Math.exp(-malus90 / 0.25);
            }
            disciplineW += w;
        }

        // Fitness: matches in the league squad (started or on the bench) over the league's season;
        // cup nights are rotation, not availability.
        const inSquadSeason = a.leagueLines > 0 ? a.inSquadLeague : a.lineups + a.bench;
        fitness += w * 100 * Math.min(1, inSquadSeason / Math.max(1, a.games));

        sample += w * a.apps;

        if (a.ratingApps > 0 && a.apps > 0) {
            // Per match played, for the fantasy average under the league's rules.
            events.rating += w * ((a.ratingSum + 6 * (missing / 90)) / (a.ratingApps + missing / 90));
            events.goals += (w * a.tGoals) / a.apps;
            events.assists += (w * a.tAssists) / a.apps;
            events.yellow += (w * a.yellow) / a.apps;
            events.red += (w * a.red) / a.apps;
            events.penaltyMissed += (w * a.penMissed) / a.apps;
            events.penaltySaved += (w * a.penSaved) / a.apps;
            events.conceded += (w * a.conceded) / a.apps;
            events.cleanSheet += w * cleanSheet;
            fantaW += w;
        }
    }
    if (fantaW > 0) for (const k of Object.keys(events) as Array<keyof FantaEvents>) events[k] /= fantaW;

    // A new signing is bought to play: with little history at the current club, what he did
    // elsewhere counts for half and the other half is what a player of his quality is expected
    // to get in a new side (a better rating and more bonus, a surer place). Fades out as the
    // matches at the club come in, never lowers a rate the numbers already back.
    const atClub = years.reduce((s, y) => s + aggregateYear(input.seasons.filter((l) => l.year === y), input.currentTeamId).atClub, 0);
    if (atClub < 10) {
        const quality = ratingW > 0 ? rating / ratingW : 50;
        const prior = Math.max(35, Math.min(85, 45 + 0.5 * (quality - 50) + 0.3 * (bonus - 50)));
        const k = 0.5 * (1 - atClub / 10);
        starter = starter * (1 - k) + Math.max(starter, prior) * k;
    }

    // The coach has spoken: this season's lineups at the club move the starter mark towards
    // what he does, with a weight that grows with the matches he was in the squad for. Keepers
    // do not rotate, two matches settle it; outfield players get six. Never the whole way,
    // and never on a player the club has not named yet (injured, just arrived).
    if (input.thisSeason && input.thisSeason.starts + input.thisSeason.benches > 0) {
        const named = input.thisSeason.starts + input.thisSeason.benches;
        const settle = input.role === 'P' ? 2 : 6;
        const w = 0.9 * Math.min(1, named / settle);
        starter = starter * (1 - w) + (100 * input.thisSeason.starts) / named * w;
    }

    // Current injury and age weigh on fitness.
    if (input.injury?.active) fitness = input.injury.longTerm ? Math.min(fitness, 20) : fitness - Math.min(35, 15 + input.injury.daysOut / 3);
    if (input.age !== null && input.age >= 33) fitness -= (input.age - 32) * 4;

    const scores = {
        starter: clamp(starter),
        bonus: bonusW > 0 ? clamp(bonus / bonusW) : 1,
        rating: ratingW > 0 ? clamp(rating / ratingW) : 1,
        discipline: disciplineW > 0 ? clamp(discipline / disciplineW) : 50,
        fitness: clamp(fitness),
        team: teamScore(input),
        form: formScore(input),
    };
    const w = WEIGHTS[input.role];
    const overall = (Object.keys(w) as Array<keyof typeof w>).reduce((s, k) => s + (scores[k] * w[k]) / 100, 0);
    // Thin evidence pulls the overall towards the low range: a man barely seen must not rank above a known reserve.
    const evidence = Math.min(1, sample / 15);
    const games = Math.round(sample);
    return {
        ...scores,
        overall: clamp(overall * evidence + 20 * (1 - evidence)),
        fantaAvg: fantaW > 0 ? fantaAvgFor(events, input.role, CLASSIC_RULES) : null,
        events: fantaW > 0 ? events : null,
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

/**
 * The club, 20..80: where it is expected to finish (last season's table, a
 * promoted club low, moved by this season's as the rounds come in), and
 * from the fifth round more and more the shape it shows for the role.
 */
function teamScore(input: AuctionInput): number {
    const strength = input.clubStrength;
    const prior = strength === null || strength === undefined ? 50 : clamp(50 + (strength - 0.5) * 60);
    const mix = clubMix(input);
    const rounds = input.teamRounds ?? 0;
    if (mix === null || rounds < 5) return prior;
    const w = Math.min(1, (rounds - 4) / 10);
    return clamp(prior * (1 - w) + (50 + (mix - 0.5) * 60) * w);
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
    const startBefore = before.lineups + before.bench > 0 ? before.lineups / (before.lineups + before.bench) : 0.5;
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
    /** Price level, 1 = the prices add up to the credits at the table (see AuctionConfig.priceLevel). */
    level?: number;
}

/** What the pricing reads of a player: the marks, or just the overall when the rest is unknown. */
export interface PricedScores extends Pick<FantaScores, 'overall'>, Partial<Pick<FantaScores, 'fantaAvg' | 'starter' | 'fitness' | 'form' | 'team' | 'sample' | 'confidence'>> {}

export interface PriceablePlayer {
    id: number;
    role: FantaRole;
    age?: number | null;
    scores: PricedScores;
}

/** Typical fantamedia of a starter in the role: the fallback when a player has no estimate. */
const ROLE_FANTA: Record<FantaRole, number> = {P: 5.7, D: 6.05, C: 6.2, A: 6.5};
/**
 * Tuning of the value model. `freeGap`: what a
 * free player brings below his fantamedia, since he does not play every
 * week and is fielded only when the starter is out.
 */
export const PRICE_TUNING = {freeGap: 0.35, tail: 1.2, ceiling: 0.4};
/**
 * Scarcity per role: the fantasy averages of keepers and defenders sit
 * close together (a top keeper is a goal a match better than a spare,
 * not three), so a gentler curve keeps their prices on a human scale;
 * attack is where the table fights.
 */
export const PRICE_POWER: Record<FantaRole, number> = {P: 1.1, D: 1.25, C: 1.3, A: 1.3};

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
    const shrink = sample / (sample + 12);
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
    // A fantamedia built on a dozen matches is a guess: it is already shrunk towards the role's level,
    // so what it still promises over the free player counts at least for half, in full from twenty matches.
    const evidence = 0.4 + 0.6 * Math.min(1, (p.scores.sample ?? 30) / 20);
    // The club: a side expected near the top creates more (and concedes less) than one near the
    // bottom, beyond what his own numbers say. About ±10% between the ends of the table.
    const club = 1 + 0.35 * ((p.scores.team ?? 50) / 100 - 0.5);
    return Math.max(0, fm - replacement) * evidence * (play + (1 - play) * upside) * avail * club;
}

/**
 * Value weights of a role's players: the expected value over the
 * replacement level, raised to the scarcity power. The replacement is
 * the level of the last player the league buys (`count` of them), so
 * everyone below is worth nothing on the market. Pure.
 */
export function valueWeights<T extends PriceablePlayer>(players: T[], role: FantaRole, count: number): Map<number, number> {
    const pool = players.filter((p) => p.role === role);
    // The level a thin fantamedia is shrunk towards: what the role's regulars actually average in this
    // pool (keepers' fantamedia has its own scale), the typical figure only when the pool cannot say.
    const regulars = pool.filter((p) => (p.scores.sample ?? 0) >= 15 && p.scores.fantaAvg !== null && p.scores.fantaAvg !== undefined).map((p) => p.scores.fantaAvg!).sort((a, b) => a - b);
    const level = regulars.length >= 8 ? regulars[Math.floor(regulars.length / 2)] : ROLE_FANTA[role];
    // A first pass with the role's typical level finds the order, the replacement is read off it.
    const first = pool.map((p) => [p, expectedValue(p, 0, level)] as const).sort((a, b) => b[1] - a[1]);
    // The free alternative: the players just outside what the league buys, at their (shrunk)
    // fantamedia less what a bench player loses by not playing every week.
    const free = first.slice(Math.min(first.length - 1, Math.max(0, count)), Math.max(1, Math.round(count * 1.5))).map(([p]) => shrunkFanta(p, level));
    const replacement = free.length > 0 ? free.reduce((s, v) => s + v, 0) / free.length - PRICE_TUNING.freeGap : level - PRICE_TUNING.freeGap;
    const out = new Map<number, number>();
    for (const p of pool) out.set(p.id, expectedValue(p, replacement, level) ** PRICE_POWER[role]);
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
        const budget = market * config.roleShare[role] * (config.level ?? 1);
        for (const p of pool) prices.set(p.id, 1);
        // No fixed ceiling: a price is what the market money and the value say, bounded only by
        // what one manager can physically pay while keeping a credit for every other slot of the
        // roster. What a bounded player leaves on the table goes to the others, a few passes until stable.
        const rosterSlots = config.slots.P + config.slots.D + config.slots.C + config.slots.A;
        // ...and never more than the ceiling of a manager's credits: nobody spends half his money on one man.
        const cap = Math.max(1, Math.min(config.credits - (rosterSlots - 1), Math.round(config.credits * PRICE_TUNING.ceiling)));
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
