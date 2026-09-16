import {NextResponse} from 'next/server';
import serieAListone from '@/core/fantasy/listone/serie-a.json';
import {createClient} from '@/lib/db/server';
import {fetchAll} from '@/lib/db/paginate';
import {footballDb} from '@/lib/football/data/shared';
import {isAdminId} from '@/lib/admin';
import {applyFantaNames} from '@/lib/fantasy/fanta-rename';
import {matchListone, parseListone, type ListoneRow} from '@/lib/fantasy/listone';

export const dynamic = 'force-dynamic';

/** "P. Pereira Gonçalves" and "Pedro António Pereira Gonçalves" from the profile's first and last name, when both are there. */
function nameForms(first: string | null, last: string | null): string[] {
    const f = first?.trim() ?? '';
    const l = last?.trim() ?? '';
    if (!l) return [];
    return f ? [`${f[0]}. ${l}`, `${f} ${l}`] : [l];
}

/**
 * The administrator's "name the players the fantasy way": the official
 * list matched to the Serie A squads, every player found renamed after
 * the list ("Valde" becomes "Valdepenas"). Idempotent: a second run
 * changes nothing.
 */
export async function POST() {
    const session = await createClient();
    const {data: auth} = await session.auth.getUser();
    if (!auth.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    if (!isAdminId(auth.user.id)) return NextResponse.json({error: 'admin only'}, {status: 403});

    const db = footballDb();
    const {data: leagueRows, error} = await db.from('leagues').select('id,seasons(id,is_current)').eq('slug', 'serie-a').limit(1);
    if (error) return NextResponse.json({error: error.message}, {status: 500});
    const season = ((leagueRows ?? [])[0] as unknown as {seasons: Array<{id: number; is_current: boolean}>} | undefined)?.seasons.find((s) => s.is_current);
    if (!season) return NextResponse.json({error: 'no season'}, {status: 404});
    const rows = (await fetchAll((a, b) => db.from('squad_members').select('player:players(id,name,first_name,last_name,fanta_name),team:teams(name)').eq('season_id', season.id).order('player_id').range(a, b), {max: 2000})) as unknown as Array<{player: {id: number; name: string; first_name: string | null; last_name: string | null; fanta_name: string | null} | null; team: {name: string} | null}>;
    const players = rows.filter((r) => r.player && r.team).map((r) => ({id: r.player!.id, name: r.player!.name, team: r.team!.name, aliases: nameForms(r.player!.first_name, r.player!.last_name), fanta: r.player!.fanta_name}));
    const {byPlayer, unmatched} = matchListone(parseListone(serieAListone as ListoneRow[]), players);
    const byId = new Map(players.map((p) => [p.id, p]));
    const matches = [...byPlayer.entries()].map(([id, m]) => ({id, fantaName: m.name, name: byId.get(id)!.name, fanta: byId.get(id)!.fanta}));
    try {
        const renamed = await applyFantaNames(matches);
        return NextResponse.json({matched: byPlayer.size, renamed, unmatched: unmatched.length});
    } catch (e) {
        return NextResponse.json({error: (e as Error).message}, {status: 500});
    }
}
