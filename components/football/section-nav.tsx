import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";

/** The pages of the numbers side of the site, in the order they are read. */
const PAGES = [
    {key: 'stats', href: '/stats'},
    {key: 'predictions', href: '/predictions'},
    {key: 'record', href: '/predictions/record'},
    {key: 'injuries', href: '/injuries'},
    {key: 'compare', href: '/compare'},
    {key: 'search', href: '/search'},
] as const;

export type SectionKey = (typeof PAGES)[number]['key'];

/**
 * One row under the header of every statistics page: rankings,
 * predictions, the model's record, absences, the comparison and the
 * search, with the page you are on marked. They are one section of the
 * site, and from any of them the others are one tap away.
 */
export async function SectionNav({current}: {current: SectionKey}) {
    const t = await getTranslations('Pages.stats.nav');
    return (
        <nav aria-label={t('label')} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mt-1">
            {PAGES.map(({key, href}) => (
                <Link
                    key={key}
                    href={href}
                    aria-current={key === current ? 'page' : undefined}
                    className={cn("bb-btn h-8 px-3 inline-flex items-center shrink-0 text-[12px] font-extrabold", key === current ? "bg-foreground text-background" : "bg-card")}
                >
                    {t(key)}
                </Link>
            ))}
        </nav>
    );
}
