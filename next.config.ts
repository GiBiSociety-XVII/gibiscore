import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
    // Strip console.* (keep error/warn) from production builds
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production'
            ? {exclude: ['error', 'warn']}
            : false,
    },
    // Badges and photos come straight from the provider's CDN, small already. With no optimizer, the
    // /_next/image addresses the crawlers learnt — a paid transformation each, long after the pages
    // stopped using them — answer with an error that costs nothing.
    images: {unoptimized: true},
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
