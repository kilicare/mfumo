import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Genuine Liquor Store',
  description: 'Generic Distribution & Business Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><meta name="referrer" content="no-referrer" /></head>
      <body>{children}</body>
    </html>
  );
}
