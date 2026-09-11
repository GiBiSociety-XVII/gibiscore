import 'server-only';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import type {AfSidelinedResponse, AfSidelinedSpell} from '@/lib/api-football/types';
import {fetchAll} from '@/lib/db/paginate';
import {AUCTION_LEAGUES} from '@/lib/fantasy/config';
import {allowance, chunk, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';
import {categorize} from './injuries';

/** Players per request (the provider's cap for `players=`). */
const BATCH = 20;
/** A spell that ended before this many days ago is history. */
const GRACE_DAYS = 2;
/** A spell starting further ahead than this is not yet an absence (a suspension to serve later). */
const AHEAD_DAYS = 30;

/**
 * sync-sidelined (every 6 hours, the squads of the fantasy leagues: ~300 requests)
 *
 * The provider's per-player spells: for every injury or suspension the
 * kind of problem, the start and the expected return. They often arrive
 * days before the per-fixture list (sync-injuries), which only fills in
 * shortly before a match, so the fantasy lineup does not field a player
 * who broke down on Sunday. The rows are kept apart (source = 'player')
 * and replaced per player on every run; the absence reader merges both.
 */
export async function syncPlayerSidelined(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-sidelined');
    try {
        if (!(await allowance(db, run, 'routine'))) {
            await finishRun(db, run, 'ok');
            return run;
        }
        const slugs = [...new Set(AUCTION_LEAGUES.filter((l) => l.slugs.length === 1).flatMap((l) => l.slugs))];
        const rows = (await fetchAll(
            (a, b) => db.from('squad_members').select('season_id,team_id,player:players!inner(id,provider_id),season:seasons!inner(is_current,league:leagues!inner(slug))').eq('seasons.is_current', true).in('seasons.leagues.slug', slugs).order('player_id').range(a, b),
            {max: 20000},
        )) as unknown as Array<{season_id: number; team_id: number; player: {id: number; provider_id: number}}>;
        // One entry per player: his first squad of the season is enough to file the spell under.
        const byProvider = new Map<number, {playerId: number; teamId: number; seasonId: number}>();
        for (const r of rows) if (!byProvider.has(r.player.provider_id)) byProvider.set(r.player.provider_id, {playerId: r.player.id, teamId: r.team_id, seasonId: r.season_id});
        run.bump('players', byProvider.size);
        const today = new Date().toISOString().slice(0, 10);
        const floor = new Date(Date.now() - GRACE_DAYS * 86_400_000).toISOString().slice(0, 10);
        const ceiling = new Date(Date.now() + AHEAD_DAYS * 86_400_000).toISOString().slice(0, 10);

        for (const batch of chunk([...byProvider.keys()], BATCH)) {
            let response: AfSidelinedResponse[] = [];
            try {
                ({response} = await apiFootballGet<AfSidelinedResponse[]>('sidelined', {players: batch.join('-')}));
            } catch (error) {
                run.warn(`sidelined: ${(error as Error).message}`);
                if (error instanceof ApiFootballError && error.kind === 'quota') throw error;
                continue;
            } finally {
                run.requests += 1;
            }
            const spells = groupSpells(response, batch);
            if (spells === null) {
                run.warn('sidelined: response shape not recognised');
                continue;
            }
            const inserts: Array<Record<string, unknown>> = [];
            for (const [providerId, list] of spells) {
                const who = byProvider.get(providerId);
                if (!who) continue;
                for (const spell of list) {
                    if (!spell.start || !/^\d{4}-\d{2}-\d{2}$/.test(spell.start)) continue;
                    // Still out (or about to be): no end, or an end still ahead (with a little grace), and a start not too far ahead.
                    if (spell.end && spell.end < floor) continue;
                    if (spell.start > ceiling) continue;
                    inserts.push({
                        season_id: who.seasonId,
                        player_id: who.playerId,
                        team_id: who.teamId,
                        fixture_id: null,
                        category: categorize(spell.type, spell.type),
                        description: spell.type,
                        start_date: spell.start,
                        end_date: spell.end && /^\d{4}-\d{2}-\d{2}$/.test(spell.end) ? spell.end : null,
                        games_missed: null,
                        source: 'player',
                    });
                }
            }
            // Replace what we knew of these players: a spell that ended is dropped with its row.
            const ids = batch.map((id) => byProvider.get(id)!.playerId);
            const {error: deleteError} = await db.from('sidelined').delete().in('player_id', ids).eq('source', 'player');
            if (deleteError) failSync('sidelined.delete', deleteError);
            if (inserts.length > 0) {
                const {error} = await db.from('sidelined').insert(inserts);
                if (error) failSync('sidelined.insert', error);
            }
            run.bump('sidelined', inserts.length);
            run.bump('active_today', inserts.filter((r) => (r.start_date as string) <= today).length);
        }
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

/** Spells per provider player id, whatever shape the endpoint used; null when neither shape fits. */
export function groupSpells(response: AfSidelinedResponse[], asked: number[]): Map<number, AfSidelinedSpell[]> | null {
    const out = new Map<number, AfSidelinedSpell[]>();
    if (response.length === 0) return out;
    if (response.every((r) => 'player' in r && r.player && Array.isArray((r as {sidelined?: unknown}).sidelined))) {
        for (const r of response as Array<{player: {id: number}; sidelined: AfSidelinedSpell[]}>) out.set(r.player.id, [...(out.get(r.player.id) ?? []), ...r.sidelined]);
        return out;
    }
    if (asked.length === 1 && response.every((r) => 'type' in r && 'start' in r)) {
        out.set(asked[0], response as AfSidelinedSpell[]);
        return out;
    }
    return null;
}
