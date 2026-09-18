import 'server-only';
import {apiFootballGet} from '@/lib/api-football/client';
import {mapLineups} from '@/lib/api-football/mappers';
import type {AfFixtureResponse} from '@/lib/api-football/types';
import {provides, type LeagueCoverage} from '@/lib/football/coverage';
import {lineupsCandidate} from '@/lib/notifications/events';
import {dispatchNotifications} from '@/lib/notifications/dispatch';
import {sendReminders} from '@/lib/notifications/reminders';
import {chunk, ensurePlayers, failSync, finishRun, footballClient, idMap, startRun, type MinimalPlayer, type SyncRun} from './context';

/** Fixtures kicking off within this many minutes are asked for their official lineups. */
const WINDOW_MINUTES = 90;
/** Fixtures per request. */
const BATCH = 20;
/** Fixtures considered per run: a Saturday afternoon of every league fits. */
const MAX_CANDIDATES = 600;

/**
 * sync-lineups (every five minutes)
 *
 * The official lineups the provider publishes about an hour before
 * kick-off, for fixtures starting within ninety minutes that have none
 * stored yet: the featured ones and the basic ones whose league the
 * provider covers for lineups (lib/football/coverage.ts). One request per
 * twenty fixtures, nothing at all when no kick-off is near. Stored as
 * expected lineups (is_expected = true), the rows the fantasy matchday
 * reads; the match itself later stores the real ones.
 */
export async function syncUpcomingLineups(options: {withinMinutes?: number} = {}): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-lineups');
    try {
        // "Kick-off in an hour" for the followed matches rides on this job's five-minute beat.
        await sendReminders(db, run);
        const now = Date.now();
        const to = new Date(now + (options.withinMinutes ?? WINDOW_MINUTES) * 60_000).toISOString();
        const {data: soon, error} = await db
            .from('fixtures')
            .select('id,provider_id,league:leagues!inner(tier,season_coverage)')
            .eq('state', 'scheduled')
            .gte('starting_at', new Date(now - 5 * 60_000).toISOString())
            .lte('starting_at', to)
            .order('starting_at')
            .limit(MAX_CANDIDATES);
        if (error) failSync('fixtures.select', error);
        const candidates = ((soon ?? []) as unknown as Array<{id: number; provider_id: number; league: {tier: 'featured' | 'basic'; season_coverage: LeagueCoverage | null}}>).filter((c) => provides(c.league.tier, c.league.season_coverage, 'lineups'));
        if (candidates.length === 0) {
            run.bump('idle');
            await finishRun(db, run, 'ok');
            return run;
        }
        // Those with an official lineup already stored are done.
        const {data: covered, error: coveredError} = await db.from('lineups').select('fixture_id').in('fixture_id', candidates.map((c) => c.id)).eq('is_expected', true);
        if (coveredError) failSync('lineups.select', coveredError);
        const done = new Set((covered ?? []).map((r) => r.fixture_id as number));
        const pending = candidates.filter((c) => !done.has(c.id));
        run.bump('pending', pending.length);
        if (pending.length === 0) {
            await finishRun(db, run, 'ok');
            return run;
        }
        const ourId = new Map(pending.map((c) => [c.provider_id, c.id]));
        for (const batch of chunk(pending, BATCH)) {
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {ids: batch.map((c) => c.provider_id).join('-')});
            run.requests += 1;
            const withLineups = response.map((f) => ({f, lineups: mapLineups(f.lineups)})).filter((m) => m.lineups.length > 0);
            if (withLineups.length === 0) continue;
            const refs: MinimalPlayer[] = withLineups.flatMap((m) => m.lineups.map((l) => ({id: l.providerPlayerId, name: l.playerName})));
            const players = await ensurePlayers(db, refs);
            const teams = await idMap(db, 'teams', [...new Set(withLineups.flatMap((m) => m.lineups.map((l) => l.providerTeamId)))]);
            const rows = withLineups.flatMap((m) =>
                m.lineups
                    .filter((l) => teams.has(l.providerTeamId) && players.has(l.providerPlayerId) && ourId.has(m.f.fixture.id))
                    .map((l) => ({
                        fixture_id: ourId.get(m.f.fixture.id)!,
                        team_id: teams.get(l.providerTeamId)!,
                        player_id: players.get(l.providerPlayerId)!,
                        is_expected: true,
                        is_starter: l.isStarter,
                        formation: l.formation,
                        formation_position: l.formationPosition,
                        jersey_number: l.jerseyNumber,
                    })),
            );
            const unique = new Map(rows.map((r) => [`${r.fixture_id}:${r.team_id}:${r.player_id}`, r]));
            for (const group of chunk([...unique.values()], 1000)) {
                const {error: upsertError} = await db.from('lineups').upsert(group, {onConflict: 'fixture_id,team_id,player_id,is_expected'});
                if (upsertError) failSync('lineups.upsert', upsertError);
            }
            run.bump('lineups', unique.size);
            run.bump('fixtures', withLineups.length);
            // The fans of the two clubs hear that the lineups are out.
            await dispatchNotifications(
                db,
                run,
                withLineups.filter((m) => ourId.has(m.f.fixture.id)).map((m) => ({fixtureId: ourId.get(m.f.fixture.id)!, candidates: [lineupsCandidate({home: m.f.teams.home.name, away: m.f.teams.away.name, league: m.f.league.name})]})),
            );
        }
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}
