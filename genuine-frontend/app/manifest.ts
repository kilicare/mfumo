import type { MetadataRoute } from 'next';

const brandPath = '/GGENUINE_FULL_BRAND_PACKAGE';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'G Genuine Business Suite',
    short_name: 'Genuine',
    description: 'Generic Distribution & Business Management System',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#101810',
    theme_color: '#20211f',
    icons: [
      {
        src: `${brandPath}/logos/png/g-genuine-app-icon-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${brandPath}/pwa/g-genuine-maskable-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `${brandPath}/pwa/g-genuine-maskable-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
