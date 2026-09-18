import type {Metadata, Viewport} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import "../globals.css";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {Analytics} from "@vercel/analytics/react";
import {SpeedInsights} from "@vercel/speed-insights/react";
import {ogLocales, routing, type AppLocale} from "@/i18n/routing";
import {AccountFavoritesSync} from "@/components/shell/account-favorites-sync";
import {IosInstallBanner} from "@/components/shell/ios-install-banner";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
    display: "swap",
    preload: true,
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
    display: "swap",
    preload: true,
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gibiscore.com";

/** Title, description and Open Graph language follow the page's language; the icons are the same everywhere. */
export async function generateMetadata({params}: LayoutProps<"/[locale]">): Promise<Metadata> {
    const {locale} = await params;
    const known = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
    const t = await getTranslations({locale: known, namespace: 'Common.meta'});
    return {
        ...metadata,
        description: t('description'),
        openGraph: {...metadata.openGraph, locale: ogLocales[known as AppLocale]},
    };
}

const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: "GiBiScore",
        template: "%s | GiBiScore",
    },
    applicationName: "GiBiScore",
    openGraph: {
        type: "website",
        siteName: "GiBiScore",
    },
    // Identity GiBi: favicon in the full-accent variant, black tile for iOS.
    icons: {
        icon: [
            {url: "/brand/svg/gibiscore-icon-accent.svg", type: "image/svg+xml"},
            {url: "/brand/png/gibiscore-favicon-accent-32.png", sizes: "32x32", type: "image/png"},
            {url: "/brand/png/gibiscore-favicon-accent-192.png", sizes: "192x192", type: "image/png"},
        ],
        apple: [{url: "/brand/png/gibiscore-icon-180.png", sizes: "180x180"}],
    },
    manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
    themeColor: "#14131A",
    width: "device-width",
    initialScale: 1,
};

export function generateStaticParams() {
    return routing.locales.map((locale) => ({locale}));
}

export default async function LocaleLayout({children, params}: LayoutProps<"/[locale]">) {
    const {locale} = await params;
    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }
    setRequestLocale(locale);
    const messages = await getMessages();

    return (
        <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
            <body className="min-h-full flex flex-col bg-background text-foreground">
                <NextIntlClientProvider messages={messages}>
                    {children}
                    <AccountFavoritesSync />
                    <IosInstallBanner />
                </NextIntlClientProvider>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
