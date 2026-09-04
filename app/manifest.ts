import type {MetadataRoute} from 'next';

// Installable on phones: black tile icons from the GiBi identity.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'GiBiScore',
        short_name: 'GiBiScore',
        description: 'Risultati live, classifiche e statistiche di calcio.',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f3ee',
        theme_color: '#14131A',
        lang: 'it',
        icons: [
            {src: '/brand/png/gibiscore-icon-192.png', sizes: '192x192', type: 'image/png'},
            {src: '/brand/png/gibiscore-icon-512.png', sizes: '512x512', type: 'image/png'},
            {src: '/brand/png/gibiscore-favicon-accent-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
        ],
    };
}
