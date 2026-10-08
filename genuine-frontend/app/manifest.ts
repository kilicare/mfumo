import type { MetadataRoute } from 'next';

const brandPath = '/GGENUINE_FULL_BRAND_PACKAGE';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'G Genuine Business Suite',
    short_name: 'Genuine',
    description: 'Genuine workspace for products, purchasing, inventory, and business operations.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f3efe6',
    theme_color: '#f3efe6',
    categories: ['business', 'productivity'],
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
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        url: '/dashboard',
        icons: [{ src: `${brandPath}/logos/png/g-genuine-app-icon-192x192.png`, sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Purchases',
        short_name: 'Purchases',
        url: '/dashboard/purchases',
        icons: [{ src: `${brandPath}/logos/png/g-genuine-app-icon-192x192.png`, sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
