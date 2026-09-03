import {useTranslations} from "next-intl";
import {Card} from "@/components/shared/ui/card";
import type {FixtureSummary} from "@/lib/football/types";
import {MatchRow} from "./match-row";

export function MatchList({title, fixtures, highlightTeamId, showCompetition, emptyKey = 'noFixtures'}: {
    title?: string;
    fixtures: FixtureSummary[];
    highlightTeamId?: number;
    showCompetition?: boolean;
    emptyKey?: 'noFixtures';
}) {
    const t = useTranslations('Football.empty');
    return (
        <Card className="overflow-hidden">
            {title && (
                <div className="px-4 md:px-5 py-3 border-b-[2.5px] border-foreground bg-muted/40">
                    <h3 className="text-sm font-extrabold uppercase tracking-wide">{title}</h3>
                </div>
            )}
            {fixtures.length === 0 ? (
                <p className="px-4 py-6 text-sm font-semibold text-muted-foreground">{t(emptyKey)}</p>
            ) : (
                <div className="flex flex-col">
                    {fixtures.map((f) => (
                        <MatchRow key={f.id} fixture={f} highlightTeamId={highlightTeamId} showCompetition={showCompetition} />
                    ))}
                </div>
            )}
        </Card>
    );
}
