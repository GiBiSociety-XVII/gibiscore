/** Structured data for the search engines, one script per object; the JSON is escaped so no markup can leak out of it. */
export function JsonLd({data}: {data: Record<string, unknown> | Array<Record<string, unknown>>}) {
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return <script type="application/ld+json" dangerouslySetInnerHTML={{__html: json}} />;
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gibiscore.com';

/** The status vocabulary of schema.org for a fixture's state. */
export function eventStatus(state: string): string {
    if (state === 'postponed') return 'https://schema.org/EventPostponed';
    if (state === 'cancelled' || state === 'abandoned') return 'https://schema.org/EventCancelled';
    return 'https://schema.org/EventScheduled';
}
