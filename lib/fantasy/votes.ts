import type {ManualVote} from './recap';

/** Sends the votes typed for a round to the account; throws when signed out or on error. */
export async function saveVotes(seasonId: number, round: string, votes: Record<number, ManualVote>, remove: number[] = []): Promise<void> {
    const res = await fetch('/api/fantasy/votes', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({seasonId, round, votes, remove})});
    if (res.status === 401) throw new Error('signed-out');
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
}
