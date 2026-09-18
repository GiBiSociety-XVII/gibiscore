'use client';

import {Cloud, CloudOff} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {cloudUser, type CloudUser} from "@/lib/fantasy/cloud";
import {deleteAccountTeam, listAccountTeams, saveAccountTeam} from "@/lib/fantasy/cloud-teams";
import {hashOf} from "@/lib/fantasy/hash";
import {localePath} from "@/lib/auth/next";
import {benchedStore, HISTORY_ROUNDS, historyStore, locksStore, outsStore, pinsStore, teamsStore, type LineupLock} from "@/lib/fantasy/store";

/** A change on the device is written to the account this long after the last one. */
const PUSH_MS = 2_000;

export type AccountStatus = 'checking' | 'anonymous' | 'pulling' | 'synced' | 'error';

const fingerprint = (team: unknown, pins: number[], outs: number[], benched: number[], lock: LineupLock | null, locks: LineupLock[]) => hashOf(JSON.stringify({team, pins, outs, benched, lock, locks: locks.map((l) => `${l.round}@${l.savedAt}`)}));

/** The device's and the account's kept lineups together: one per round, the later save wins, the last few rounds only. */
function mergeLocks(a: LineupLock[], b: LineupLock[]): LineupLock[] {
    const byRound = new Map<string, LineupLock>();
    for (const l of [...a, ...b]) {
        const known = byRound.get(l.round);
        if (!known || known.savedAt < l.savedAt) byRound.set(l.round, l);
    }
    return [...byRound.values()].sort((x, y) => x.deadline.localeCompare(y.deadline)).slice(-HISTORY_ROUNDS);
}

/**
 * Keeps the device's fantasy teams (roster, pins, outs, frozen lineup) in
 * step with the signed-in user's account: on load the account's rows are
 * merged into the device (the newer roster wins, the account's pins,
 * outs and frozen lineup win unless the device's is newer), then every
 * change on the device follows to the account, and a team removed here
 * is removed there. Signed out, nothing happens: the device keeps its own.
 */
export function useAccountTeams(): {user: CloudUser | null; status: AccountStatus} {
    const [user, setUser] = useState<CloudUser | null | undefined>(undefined);
    const [status, setStatus] = useState<AccountStatus>('checking');
    const saved = teamsStore.useValue();
    const pins = pinsStore.useValue();
    const outs = outsStore.useValue();
    const benched = benchedStore.useValue();
    const locks = locksStore.useValue();
    const history = historyStore.useValue();
    /** Per team id, the content the account holds (as pushed or pulled): only what differs is written. */
    const known = useRef<Map<string, string>>(new Map());
    const pulled = useRef(false);

    useEffect(() => {
        let alive = true;
        cloudUser()
            .then((u) => {
                if (!alive) return;
                setUser(u);
                if (!u) setStatus('anonymous');
            })
            .catch(() => {
                if (alive) {
                    setUser(null);
                    setStatus('anonymous');
                }
            });
        return () => {
            alive = false;
        };
    }, []);

    // Pull once: the account's teams into the device.
    useEffect(() => {
        if (!user || pulled.current) return;
        pulled.current = true;
        let alive = true;
        setStatus('pulling');
        listAccountTeams()
            .then((rows) => {
                if (!alive) return;
                const localTeams = teamsStore.read();
                const localPins = pinsStore.read();
                const localOuts = outsStore.read();
                const localBenched = benchedStore.read();
                const localLocks = locksStore.read();
                const localHistory = historyStore.read();
                const byId = new Map(localTeams.teams.map((t) => [t.id, t]));
                const nextPins = {...localPins};
                const nextOuts = {...localOuts};
                const nextBenched = {...localBenched};
                const nextLocks = {...localLocks};
                const nextHistory = {...localHistory};
                for (const row of rows) {
                    const mine = byId.get(row.id);
                    if (!mine || mine.savedAt < row.team.savedAt) byId.set(row.id, row.team);
                    nextPins[row.id] = row.pins;
                    nextOuts[row.id] = row.outs;
                    nextBenched[row.id] = row.benched;
                    const local = localLocks[row.id];
                    if (row.lock && (!local || local.round !== row.lock.round || local.savedAt < row.lock.savedAt)) nextLocks[row.id] = row.lock;
                    const merged = mergeLocks(localHistory[row.id] ?? [], row.locks);
                    if (merged.length > 0) nextHistory[row.id] = merged;
                    known.current.set(row.id, fingerprint(row.team, row.pins, row.outs, row.benched, row.lock, merged));
                }
                teamsStore.write({...localTeams, teams: [...byId.values()]});
                pinsStore.write(nextPins);
                outsStore.write(nextOuts);
                benchedStore.write(nextBenched);
                locksStore.write(nextLocks);
                historyStore.write(nextHistory);
                setStatus('synced');
            })
            .catch((error: Error) => {
                console.error('[fantasy] account teams', error);
                if (alive) setStatus('error');
            });
        return () => {
            alive = false;
        };
    }, [user]);

    // Push what changed, a little after the last change.
    useEffect(() => {
        if (!user || status !== 'synced') return;
        const timer = window.setTimeout(async () => {
            try {
                const present = new Set(saved.teams.map((t) => t.id));
                for (const team of saved.teams) {
                    const row = {id: team.id, team, pins: pins[team.id] ?? [], outs: outs[team.id] ?? [], benched: benched[team.id] ?? [], lock: locks[team.id]?.round ? locks[team.id] : null, locks: history[team.id] ?? []};
                    const fp = fingerprint(row.team, row.pins, row.outs, row.benched, row.lock, row.locks);
                    if (known.current.get(team.id) === fp) continue;
                    await saveAccountTeam(user.id, row);
                    known.current.set(team.id, fp);
                }
                for (const id of [...known.current.keys()]) {
                    if (present.has(id)) continue;
                    await deleteAccountTeam(id);
                    known.current.delete(id);
                }
            } catch (error) {
                console.error('[fantasy] account teams', error);
                setStatus('error');
            }
        }, PUSH_MS);
        return () => window.clearTimeout(timer);
    }, [user, status, saved, pins, outs, benched, locks, history]);

    return {user: user ?? null, status};
}

/** A word on where the teams live: the account, or this device only (with a way in). */
export function AccountTeamsBadge({status, next}: {status: AccountStatus; next: string}) {
    const t = useTranslations('Fantasy.cloud');
    // Where to come back to after signing in, in the language of the page you are on.
    const back = localePath(useLocale(), next);
    if (status === 'checking') return null;
    if (status === 'anonymous') {
        return (
            <Link href={{pathname: '/signin', query: {next: back}}} className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:underline decoration-accent decoration-2 underline-offset-2">
                <CloudOff className="w-3.5 h-3.5" aria-hidden="true" />
                {t('teamsSignIn')}
            </Link>
        );
    }
    return (
        <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold", status === 'error' ? "text-red-700" : "text-muted-foreground")} title={status === 'error' ? t('teamsError') : t('teamsSyncedHint')}>
            <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
            {status === 'error' ? t('teamsError') : status === 'pulling' ? t('teamsPulling') : t('teamsSynced')}
        </span>
    );
}
