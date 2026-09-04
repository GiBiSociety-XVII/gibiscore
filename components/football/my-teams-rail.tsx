'use client';

import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Panel} from "@/components/shell/panel";
import {useFavoriteTeams} from "@/lib/favorites";
import type {TeamBrief} from "@/lib/football/data/teams";
import {MatchRow} from "./match-row";
import {TeamCrest} from "./team-crest";

const cache = new Map<string, Promise<TeamBrief | null>>();

function load(slug: string): Promise<TeamBrief | null> {
    if (!cache.has(slug)) {
        cache.set(slug, fetch(`/api/teams/${encodeURIComponent(slug)}`).then((r) => (r.ok ? (r.json() as Promise<TeamBrief | null>) : null)).catch(() => null));
    }
    return cache.get(slug)!;
}

/** Home rail: the starred teams with their last result and next match. Nothing until a team is starred. */
export function MyTeamsRail() {
    const t = useTranslations('Common.rail');
    const {favorites} = useFavoriteTeams();
    const [briefs, setBriefs] = useState<Record<string, TeamBrief | null | undefined>>({});

    useEffect(() => {
        let alive = true;
        for (const slug of favorites) {
            if (briefs[slug] !== undefined) continue;
            load(slug).then((b) => {
                if (alive) setBriefs((prev) => ({...prev, [slug]: b}));
            });
        }
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [favorites.join(',')]);

    if (favorites.length === 0) return null;

    return (
        <Panel title={t('myTeams')}>
            <div className="flex flex-col">
                {favorites.map((slug) => {
                    const b = briefs[slug];
                    return (
                        <div key={slug} className="flex flex-col border-t-2 border-foreground first:border-t-0">
                            {b === undefined ? (
                                <div className="px-3 py-2 animate-pulse"><div className="h-5 rounded bg-muted" /></div>
                            ) : b === null ? null : (
                                <>
                                    <Link href={`/teams/${slug}`} className="flex items-center gap-2 px-2.5 h-8 bg-muted/60 hover:bg-muted text-[12px] font-extrabold">
                                        <TeamCrest team={b.team} size={18} />
                                        <span className="truncate">{b.team.name}</span>
                                    </Link>
                                    {b.next ? <MatchRow fixture={b.next} showDate showCompetition highlightTeamId={b.team.id} compact /> : null}
                                    {b.last ? <MatchRow fixture={b.last} showDate showCompetition highlightTeamId={b.team.id} compact /> : null}
                                    {!b.next && !b.last && <p className="px-3 py-2 text-[12px] font-semibold text-muted-foreground">{t('noMatches')}</p>}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
}
