'use client';

import Image from "next/image";
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Panel} from "@/components/shell/panel";
import {FavoriteStar} from "@/components/football/favorite-star";
import {Flag} from "@/components/football/flag";
import {TeamCrest} from "@/components/football/team-crest";
import {useFavoriteTeams, useFavorites} from "@/lib/favorites";
import type {CompetitionSummary, TeamSummary} from "@/lib/football/types";

interface Details {
    competitions: CompetitionSummary[];
    teams: TeamSummary[];
}

/**
 * The favourites on the profile page: the starred competitions and
 * teams (the same stars as everywhere on the site, synced with the
 * account), with the star to let one go. The names and logos come from
 * one request; a slug the site no longer knows is simply not shown.
 */
export function FavoritesPanel() {
    const t = useTranslations('Account.profile.favorites');
    const {favorites: competitions} = useFavorites();
    const {favorites: teams} = useFavoriteTeams();
    const [details, setDetails] = useState<Details>({competitions: [], teams: []});
    const key = `${competitions.join(',')}|${teams.join(',')}`;

    useEffect(() => {
        let alive = true;
        if (competitions.length === 0 && teams.length === 0) {
            queueMicrotask(() => setDetails({competitions: [], teams: []}));
            return;
        }
        const params = new URLSearchParams();
        if (competitions.length > 0) params.set('competitions', competitions.join(','));
        if (teams.length > 0) params.set('teams', teams.join(','));
        fetch(`/api/favorites?${params}`)
            .then((r) => (r.ok ? (r.json() as Promise<Details>) : null))
            .then((d) => { if (alive && d) setDetails(d); })
            .catch(() => undefined);
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const row = "flex items-center gap-2 px-3 h-9 border-t border-muted first:border-t-0 text-[13px] font-extrabold min-w-0";
    return (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 items-start">
            <Panel title={`${t('competitions')} · ${competitions.length}`}>
                {details.competitions.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] font-semibold text-muted-foreground leading-snug">{t('emptyCompetitions')}</p>
                ) : (
                    <ul>
                        {details.competitions.map((c) => (
                            <li key={c.slug} className={row}>
                                {c.logoUrl && !c.countryCode ? <Image src={c.logoUrl} alt="" width={18} height={18} unoptimized className="object-contain shrink-0" /> : <Flag code={c.countryCode} logoUrl={c.logoUrl} size={18} />}
                                <Link href={`/competitions/${c.slug}`} className="truncate hover:underline decoration-accent decoration-[3px] underline-offset-2">{c.country ? `${c.country} · ` : ''}{c.name}</Link>
                                <FavoriteStar slug={c.slug} className="ml-auto" size={16} />
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
            <Panel title={`${t('teams')} · ${teams.length}`}>
                {details.teams.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] font-semibold text-muted-foreground leading-snug">{t('emptyTeams')}</p>
                ) : (
                    <ul>
                        {details.teams.map((team) => (
                            <li key={team.slug} className={row}>
                                <TeamCrest team={team} size={20} />
                                <Link href={`/teams/${team.slug}`} className="truncate hover:underline decoration-accent decoration-[3px] underline-offset-2">{team.name}</Link>
                                <FavoriteStar slug={team.slug!} kind="team" className="ml-auto" size={16} />
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
        </div>
    );
}
