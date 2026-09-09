import type {ReactNode} from "react";
import {ArrowLeft} from "lucide-react";
import {getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {BrandLockup} from "@/components/shared/layout/logo";

/**
 * The frame of the sign-in, sign-up and confirmation pages, as on
 * gibiarena.com: a bar with the lockup and a way back, one card in the
 * middle of the page, a line of small print under it.
 */
export async function AuthFrame({children, footer, center = false}: {children: ReactNode; footer?: ReactNode; /** Centre the text of the card (confirmation page). */ center?: boolean}) {
    const t = await getTranslations('Account');
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="sticky top-0 z-50 w-full bg-background border-b-[2.5px] border-foreground">
                <div className="flex h-16 items-center justify-between px-4 md:px-6 max-w-7xl mx-auto w-full">
                    <Link href="/" className="flex items-center shrink-0 hover:opacity-80 transition-opacity" aria-label="GiBiScore">
                        <BrandLockup height={40} className="h-9 md:h-10 w-auto" />
                    </Link>
                    <Link href="/" className="text-sm font-bold text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                        {t('back')}
                    </Link>
                </div>
            </header>
            <main className="flex-1 flex items-center justify-center px-4 py-12">
                <div className={center ? "w-full max-w-md text-center" : "w-full max-w-md"}>
                    <div className="bb-surface p-6 sm:p-8 bg-card">{children}</div>
                    {footer && <p className="text-center text-xs font-semibold text-muted-foreground mt-6">{footer}</p>}
                </div>
            </main>
        </div>
    );
}
