import 'server-only';
import {romeDate} from '@/lib/football/data/scores';
import {chunk, getState, setState, type FootballClient, type SyncRun} from '@/lib/football/sync/context';
import {notifyUsers} from './dispatch';
import {localize, type Localized} from './events';

/** The users already served today, so a second run of the day sends nothing twice. */
const STATE_KEY = 'notifications_digest';

/**
 * The evening digest: to every subscribed user, the results of the day
 * of the teams they follow, in one notification. Nothing for a user
 * whose teams did not play. Once a day, whatever the number of runs.
 */
export async function sendDigest(db: FootballClient, run: SyncRun): Promise<void> {
    const today = romeDate(new Date());
    const done = (await getState<{day: string; users: string[]}>(db, STATE_KEY)) ?? {day: today, users: []};
    const served = new Set(done.day === today ? done.users : []);

    const {data: subRows, error: subError} = await db.from('push_subscriptions').select('user_id').limit(20000);
    if (subError) throw subError;
    const userIds = [...new Set((subRows ?? []).map((r) => r.user_id as string))].filter((id) => !served.has(id));
    if (userIds.length === 0) {
        run.bump('idle');
        return;
    }
    const favorites = new Map<string, string[]>();
    for (const ids of chunk(userIds, 300)) {
        const {data, error} = await db.from('user_favorites').select('user_id,teams').in('user_id', ids);
        if (error) throw error;
        for (const r of data ?? []) favorites.set(r.user_id as string, Array.isArray(r.teams) ? (r.teams as unknown[]).filter((s): s is string => typeof s === 'string') : []);
    }
    const slugs = [...new Set([...favorites.values()].flat())];
    if (slugs.length === 0) {
        run.bump('idle');
        return;
    }

    // The day's results of those teams, Rome day.
    const from = new Date(`${today}T00:00:00+02:00`);
    const {data: fixtureRows, error: fixtureError} = await db
        .from('fixtures')
        .select('id,starting_at,home_score,away_score,home:teams!fixtures_home_team_id_fkey(name,slug),away:teams!fixtures_away_team_id_fkey(name,slug)')
        .eq('state', 'finished')
        .gte('starting_at', new Date(from.getTime() - 3 * 3_600_000).toISOString())
        .lte('starting_at', new Date().toISOString())
        .limit(5000);
    if (fixtureError) throw fixtureError;
    const results = ((fixtureRows ?? []) as unknown as Array<{id: number; starting_at: string; home_score: number | null; away_score: number | null; home: {name: string; slug: string} | null; away: {name: string; slug: string} | null}>)
        .filter((f) => romeDate(new Date(f.starting_at)) === today && f.home && f.away && (slugs.includes(f.home.slug) || slugs.includes(f.away.slug)));
    if (results.length === 0) {
        run.bump('idle');
        return;
    }

    const targets: Array<{userId: string; text: Localized; url: string; tag: string}> = [];
    for (const userId of userIds) {
        const mine = favorites.get(userId) ?? [];
        const lines = results.filter((f) => mine.includes(f.home!.slug) || mine.includes(f.away!.slug)).map((f) => `${f.home!.name} ${f.home_score ?? 0}-${f.away_score ?? 0} ${f.away!.name}`);
        if (lines.length === 0) continue;
        const one = lines.length === 1;
        targets.push({
            userId,
            text: localize((_w, locale) => ({title: locale === 'en' ? (one ? 'Your team today' : 'Your teams today') : one ? 'Oggi la tua squadra' : 'Oggi le tue squadre', body: lines.join(' · ')})),
            url: '/',
            tag: `digest-${today}`,
        });
    }
    await notifyUsers(db, run, 'digest', targets);
    run.bump('digest_users', targets.length);
    await setState(db, STATE_KEY, {day: today, users: [...served, ...targets.map((t) => t.userId)]});
}
