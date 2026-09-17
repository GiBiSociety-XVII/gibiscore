import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {PredictionsBoard, type BoardBlock} from "@/components/football/predictions-board";
import {getUpcomingPredictions} from "@/lib/football/data/predictions";
import {romeDate, shiftDay} from "@/lib/football/data/scores";
import {suggestBets} from "@/lib/football/markets";

export const revalidate = 600;

/** Days ahead the page lists; the filters narrow to today and tomorrow. */
const DAYS = 7;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.predictions');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function PredictionsPage({params}: PageProps<"/[locale]/predictions">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.predictions');
    const tp = await getTranslations('Football.prediction');
    const blocks = await getUpcomingPredictions(DAYS);
    const today = romeDate(new Date());
    // The same slips the match page proposes, from the same prediction and odds.
    const board: BoardBlock[] = blocks.map((b) => ({
        competition: b.competition,
        fixtures: b.fixtures.map(({fixture, prediction, odds}) => ({fixture, prediction, slips: prediction ? suggestBets(prediction, odds) : [], day: romeDate(new Date(fixture.startingAt))})),
    }));

    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={`${t('days', {count: DAYS})} · ${t('intro')}`} aside={<Link href="/predictions/record" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('recordLink')}</Link>} />
            <PredictionsBoard blocks={board} today={today} tomorrow={shiftDay(today, 1)} />
            <p className="text-[12px] font-semibold text-muted-foreground">{tp('listHint')} {t('adviceLegend')}</p>
        </SiteShell>
    );
}
