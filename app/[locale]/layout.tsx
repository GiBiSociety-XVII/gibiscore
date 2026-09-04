import type {Metadata, Viewport} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import "../globals.css";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {Analytics} from "@vercel/analytics/react";
import {SpeedInsights} from "@vercel/speed-insights/react";
import {routing} from "@/i18n/routing";

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

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: "GiBiScore",
        template: "%s | GiBiScore",
    },
    description:
        "GiBiScore: risultati live, classifiche e statistiche di squadre e giocatori di tutte le competizioni di calcio del mondo.",
    applicationName: "GiBiScore",
    openGraph: {
        type: "website",
        siteName: "GiBiScore",
        locale: "it_IT",
    },
};

export const viewport: Viewport = {
    themeColor: "#f5f3ee",
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
                </NextIntlClientProvider>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
