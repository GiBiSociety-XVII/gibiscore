import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
    // Strip console.* (keep error/warn) from production builds
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production'
            ? {exclude: ['error', 'warn']}
            : false,
    },
    images: {
        remotePatterns: [
            // Sportmonks CDN (team logos, player photos, league badges)
            {protocol: 'https', hostname: 'cdn.sportmonks.com'},
        ],
    },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
