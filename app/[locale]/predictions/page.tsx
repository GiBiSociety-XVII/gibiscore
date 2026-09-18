import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {SectionNav} from "@/components/football/section-nav";
import {PredictionsBoard, type BoardBlock} from "@/components/football/predictions-board";
import {TourLauncher} from "@/components/football/tour-launcher";
import {getUpcomingPredictions} from "@/lib/football/data/predictions";
import {romeDate, shiftDay} from "@/lib/football/data/scores";
import {suggestBets} from "@/lib/football/markets";

export const revalidate = 600;

/** Days ahead the page lists; the filters narrow to today and tomorrow. */
const DAYS = 7;

/** The guide's stops, in order: each a `data-tour` on the page; the list ones are skipped when no match is on. */
const TOUR_STEPS = ['days', 'competition', 'schedina', 'legend', 'list', 'match', 'tiers', 'record'] as const;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.predictions');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function PredictionsPage({params}: PageProps<"/[locale]/predictions">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.predictions');
    const blocks = await getUpcomingPredictions(DAYS);
    const today = romeDate(new Date());
    // The same slips the match page proposes, from the same prediction and odds.
    const board: BoardBlock[] = blocks.map((b) => ({
        competition: b.competition,
        fixtures: b.fixtures.map(({fixture, prediction, odds}) => ({fixture, prediction, slips: prediction ? suggestBets(prediction, odds) : [], day: romeDate(new Date(fixture.startingAt))})),
    }));

    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={`${t('days', {count: DAYS})} · ${t('intro')}`} aside={
                    <div className="flex items-center gap-2">
                        <TourLauncher storageKey="gibiscore:predictions-tour:v1" label={t('tour.button')} hint={t('tour.open')} steps={TOUR_STEPS.map((key) => ({target: key, title: t(`tour.steps.${key}.title`), text: t(`tour.steps.${key}.text`)}))} />
                        <Link data-tour="record" href="/predictions/record" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('recordLink')}</Link>
                    </div>
                } />
            <SectionNav current="predictions" />
            <PredictionsBoard blocks={board} today={today} tomorrow={shiftDay(today, 1)} />
        </SiteShell>
    );
}
