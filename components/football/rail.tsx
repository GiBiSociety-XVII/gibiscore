import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Panel} from "@/components/shell/site-shell";
import {getNavigation} from "@/lib/football/data/navigation";
import type {ScoresPage} from "@/lib/football/data/scores";
import type {FixtureSummary, RankedPlayer, StandingGroup} from "@/lib/football/types";
import {FavoritesRail} from "./favorites-rail";
import {MyTeamsRail} from "./my-teams-rail";
import {MatchRow} from "./match-row";
import {Rankings} from "./rankings";
import {StandingsTable} from "./standings-table";

export async function StandingsPanel({title, slug, groups, highlightTeamIds}: {title: string; slug: string; groups: StandingGroup[]; highlightTeamIds?: number[]}) {
    const t = await getTranslations('Common.rail');
    return (
        <Panel scroll title={title} action={<Link href={`/competitions/${slug}`} className="text-[11px] font-extrabold underline decoration-accent decoration-[2px] underline-offset-2">{t('fullStandings')}</Link>}>
            <StandingsTable groups={groups} compact highlightTeamIds={highlightTeamIds} />
        </Panel>
    );
}

export async function ScorersPanel({title, players}: {title: string; players: RankedPlayer[]}) {
    return (
        <Panel title={title}>
            <div className="px-1"><Rankings kind="scorers" players={players} limit={5} /></div>
        </Panel>
    );
}

export async function HeadToHeadPanel({fixtures}: {fixtures: FixtureSummary[]}) {
    const t = await getTranslations('Common.rail');
    if (fixtures.length === 0) return null;
    return (
        <Panel title={t('headToHead')}>
            <div className="flex flex-col">{fixtures.map((f) => <MatchRow key={f.id} fixture={f} showDate compact />)}</div>
        </Panel>
    );
}

/**
 * Rail of the scores pages: the user's favourite competitions (browser
 * side), defaulting to the pinned competitions playing that day.
 */
export async function ScoresRail({page}: {page: ScoresPage}) {
    const nav = await getNavigation();
    const today = page.pinned.map((g) => g.competition);
    const defaults = (today.length > 0 ? today : nav.pinned).slice(0, 2).map((c) => c.slug);
    const seen = new Set<string>();
    const catalog = [...nav.pinned, ...today]
        .filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)))
        .map((c) => ({slug: c.slug, name: c.name, logoUrl: c.logoUrl}));
    return (
        <>
            <MyTeamsRail />
            <FavoritesRail defaults={defaults} catalog={catalog} />
        </>
    );
}
