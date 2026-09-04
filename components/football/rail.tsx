import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Panel} from "@/components/shell/site-shell";
import {getStandingsBySlug} from "@/lib/football/data/competitions";
import type {ScoresPage} from "@/lib/football/data/scores";
import type {FixtureSummary, RankedPlayer, StandingGroup} from "@/lib/football/types";
import {MatchRow} from "./match-row";
import {Rankings} from "./rankings";
import {StandingsTable} from "./standings-table";

export async function StandingsPanel({title, slug, groups, highlightTeamIds, limit = 10}: {title: string; slug: string; groups: StandingGroup[]; highlightTeamIds?: number[]; limit?: number}) {
    const t = await getTranslations('Common.rail');
    return (
        <Panel title={title} action={<Link href={`/competitions/${slug}`} className="text-[11px] font-extrabold underline decoration-accent decoration-[2px] underline-offset-2">{t('fullStandings')}</Link>}>
            <StandingsTable groups={groups} compact limit={limit} highlightTeamIds={highlightTeamIds} />
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
            <div className="flex flex-col">{fixtures.map((f) => <MatchRow key={f.id} fixture={f} showDate />)}</div>
        </Panel>
    );
}

export async function AdPanel() {
    const t = await getTranslations('Common.rail');
    return <div className="border-2 border-dashed border-muted-foreground/60 rounded-2xl h-[100px] flex items-center justify-center text-[12px] font-bold text-muted-foreground">{t('adSlot')}</div>;
}

/** Rail of the scores pages: tables of the first pinned competitions playing that day. */
export async function ScoresRail({page}: {page: ScoresPage}) {
    const t = await getTranslations('Common.rail');
    const slugs = page.pinned.slice(0, 2).map((g) => g.competition.slug);
    const tables = (await Promise.all(slugs.map((slug) => getStandingsBySlug(slug)))).filter((x): x is NonNullable<typeof x> => x !== null && x.groups.length > 0);
    return (
        <>
            {tables.map((table) => (
                <StandingsPanel key={table.competition.slug} title={`${t('standings')} ${table.competition.name}`} slug={table.competition.slug} groups={table.groups} limit={8} />
            ))}
            <AdPanel />
        </>
    );
}
