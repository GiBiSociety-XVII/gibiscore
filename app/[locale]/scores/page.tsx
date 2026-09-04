import {redirect} from "@/i18n/navigation";
import {isIsoDay} from "@/lib/football/data/scores";

// /scores?date=YYYY-MM-DD (no-JS date form) -> /scores/YYYY-MM-DD; bare /scores -> today.
export default async function ScoresIndex({params, searchParams}: PageProps<"/[locale]/scores">) {
    const {locale} = await params;
    const {date} = await searchParams;
    const day = Array.isArray(date) ? date[0] : date;
    redirect({href: isIsoDay(day) ? `/scores/${day}` : '/', locale});
}
