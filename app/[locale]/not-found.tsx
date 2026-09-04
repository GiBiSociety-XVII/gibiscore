import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import AppBar from "@/components/shell/app-bar";
import Footer from "@/components/shared/layout/footer";
import {buttonClasses} from "@/components/shared/ui/button";

export default function NotFound() {
    const t = useTranslations('Common.notFound');

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <AppBar />
            <main className="flex-1 flex flex-col items-center justify-center gap-5 px-4 py-20 text-center">
                <h1 className="text-5xl font-extrabold tracking-tight">404</h1>
                <p className="text-xl font-bold">{t('title')}</p>
                <p className="text-muted-foreground max-w-md">{t('description')}</p>
                <Link href="/" className={buttonClasses('primary', 'default')}>{t('backHome')}</Link>
            </main>
            <Footer />
        </div>
    );
}
