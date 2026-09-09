'use client';

import {ArrowRight} from "lucide-react";
import {useEffect} from "react";
import {useTranslations} from "next-intl";
import {buttonClasses} from "@/components/shared/ui/button";

const REDIRECT_MS = 8_000;

/** The button of the confirmation page, and the automatic move to `next` a few seconds later. */
export function SuccessRedirect({next}: {next: string}) {
    const t = useTranslations('Account.success');
    useEffect(() => {
        const timer = window.setTimeout(() => window.location.assign(next), REDIRECT_MS);
        return () => window.clearTimeout(timer);
    }, [next]);
    return (
        <a href={next} className={buttonClasses('primary', 'default', 'w-full')}>
            {t('go')}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </a>
    );
}
