import {notFound} from 'next/navigation';

// Any unmatched route under /[locale] renders the localized not-found page.
export default function CatchAllPage() {
    notFound();
}
