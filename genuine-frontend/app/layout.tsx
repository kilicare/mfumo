import type { Metadata } from 'next';
import './globals.css';
import { AppToaster } from '@/components/ui/AppToaster';

export const metadata: Metadata = {
  title: 'Genuine Business Suite',
  applicationName: 'Genuine Business Suite',
  description: 'Generic Distribution & Business Management System',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/GGENUINE_FULL_BRAND_PACKAGE/logos/png/g-genuine-app-icon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
      },
      {
        url: '/GGENUINE_FULL_BRAND_PACKAGE/logos/png/g-genuine-app-icon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/GGENUINE_FULL_BRAND_PACKAGE/pwa/apple-touch-icon-180x180.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><meta name="referrer" content="no-referrer" /></head>
      <body>{children}<AppToaster /></body>
    </html>
  );
}
