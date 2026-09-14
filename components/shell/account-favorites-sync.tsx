'use client';

import {useEffect, useRef, useState} from "react";
import {favoriteCompetitionsStore, favoriteTeamsStore, useFavoriteTeams, useFavorites} from "@/lib/favorites";
import {loadAccountFavorites, saveAccountFavorites, sessionUserId} from "@/lib/favorites-cloud";

/** A change on the device is written to the account this long after the last one. */
const PUSH_MS = 1_500;

/**
 * Keeps the device's favourites in step with the signed-in user's
 * account: on load the account's lists come first, with whatever the
 * device had on top of them appended; then every star toggled follows
 * to the account. Signed out, nothing happens. Mounted once in the
 * layout, renders nothing.
 */
export function AccountFavoritesSync() {
    const [userId, setUserId] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const {favorites: competitions} = useFavorites();
    const {favorites: teams} = useFavoriteTeams();
    /** What the account holds, as last pulled or pushed. */
    const known = useRef<string | null>(null);

    useEffect(() => {
        let alive = true;
        sessionUserId()
            .then((id) => {
                if (alive) setUserId(id);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!userId) return;
        let alive = true;
        loadAccountFavorites()
            .then((account) => {
                if (!alive) return;
                if (account) {
                    const merge = (first: readonly string[], second: readonly string[]) => [...first, ...second.filter((s) => !first.includes(s))];
                    const nextCompetitions = merge(account.competitions, favoriteCompetitionsStore.read());
                    const nextTeams = merge(account.teams, favoriteTeamsStore.read());
                    favoriteCompetitionsStore.write(nextCompetitions);
                    favoriteTeamsStore.write(nextTeams);
                    known.current = JSON.stringify({competitions: account.competitions, teams: account.teams});
                } else {
                    known.current = JSON.stringify({competitions: [], teams: []});
                }
                setReady(true);
            })
            .catch((error: Error) => console.error('[favorites] account', error));
        return () => {
            alive = false;
        };
    }, [userId]);

    useEffect(() => {
        if (!userId || !ready) return;
        const snapshot = JSON.stringify({competitions, teams});
        if (snapshot === known.current) return;
        const timer = window.setTimeout(() => {
            saveAccountFavorites(userId, {competitions, teams})
                .then(() => {
                    known.current = snapshot;
                })
                .catch((error: Error) => console.error('[favorites] account', error));
        }, PUSH_MS);
        return () => window.clearTimeout(timer);
    }, [userId, ready, competitions, teams]);

    return null;
}
