import {useTranslations} from "next-intl";
import type {FixtureSummary} from "@/lib/football/types";
import {MatchRow} from "./match-row";

/** Bordered list of rows with an optional title bar. Empty state included. */
export function MatchList({fixtures, title, highlightTeamId, showDate = false, showCompetition = false}: {fixtures: FixtureSummary[]; title?: string; highlightTeamId?: number; showDate?: boolean; showCompetition?: boolean}) {
    const t = useTranslations('Football.empty');
    return (
        <section className="bb-surface overflow-hidden">
            {title && <h3 className="px-2.5 h-8 flex items-center text-[12px] font-extrabold uppercase tracking-wide border-b-2 border-foreground bg-card">{title}</h3>}
            {fixtures.length === 0 ? (
                <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('noFixtures')}</p>
            ) : (
                <div className="flex flex-col">
                    {fixtures.map((f) => <MatchRow key={f.id} fixture={f} highlightTeamId={highlightTeamId} showDate={showDate} showCompetition={showCompetition} />)}
                </div>
            )}
        </section>
    );
}
