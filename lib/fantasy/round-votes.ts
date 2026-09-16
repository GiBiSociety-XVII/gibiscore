/**
 * The votes typed for a season, the latest per round and player, as
 * the function fantasy_round_votes hands them out. The Data API returns
 * at most 1000 rows per request whatever is asked, and a season passes
 * that by its fourth round; read a page at a time, the rows of a round
 * beyond the first thousand are not lost.
 */

export interface RoundVoteRow {
    round: string;
    player_id: number;
    team_id: number;
    /** 0 = a typed "no vote"; null = a row that corrects the events only. */
    voto: number | string | null;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    conceded: number;
    penalties_saved: number;
    penalties_missed: number;
    own_goals: number;
    updated_at: string;
}

type Page = PromiseLike<{data: unknown; error: {message: string} | null}>;

/** What the reader needs of a Supabase client, browser or server: the call and its row range. */
export interface RoundVotesDb {
    rpc: (fn: 'fantasy_round_votes', args: {p_season: number}) => {range: (from: number, to: number) => Page};
}

const PAGE = 1000;
/** More rows than a season can hold (38 rounds of 350): a guard, not a limit. */
const MAX = 20000;

/** Every typed vote of the season, all pages; throws on the first failed request. */
export async function readRoundVotes(db: RoundVotesDb, seasonId: number): Promise<RoundVoteRow[]> {
    const out: RoundVoteRow[] = [];
    for (let from = 0; from < MAX; from += PAGE) {
        const {data, error} = await db.rpc('fantasy_round_votes', {p_season: seasonId}).range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as RoundVoteRow[];
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}
