import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {ScoresRail} from "@/components/football/rail";
import {ScoresView} from "@/components/football/scores-view";
import {TourLauncher} from "@/components/football/tour-launcher";
import {WelcomeStrip} from "@/components/football/welcome-strip";
import {getScores, romeDate} from "@/lib/football/data/scores";

// Today's scores: the front page of the site. Rebuilt every minute.
export const revalidate = 30;

/** The guide's stops, in order: each a `data-tour` on the page; the ones hidden at this screen size (sidebar, rail, mobile tabs) are skipped. */
const TOUR_STEPS = ['welcome', 'dates', 'filters', 'list', 'competition', 'match', 'sidebar', 'chips', 'rail', 'sections', 'search', 'mobileTabs'] as const;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.scores');
    return {title: {absolute: `GiBiScore · ${t('metaTitle')}`}, description: t('metaDescription')};
}

export default async function HomePage({params}: PageProps<"/[locale]">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.scores');
    const page = await getScores({mode: 'day', date: romeDate(new Date())});
    return (
        <SiteShell rail={<ScoresRail page={page} />}>
            <WelcomeStrip />
            <div className="flex justify-end -mb-1">
                <TourLauncher storageKey="gibiscore:home-tour:v1" label={t('tour.button')} hint={t('tour.open')} steps={TOUR_STEPS.map((key) => ({target: key, title: t(`tour.steps.${key}.title`), text: t(`tour.steps.${key}.text`)}))} />
            </div>
            <ScoresView page={page} />
        </SiteShell>
    );
}
