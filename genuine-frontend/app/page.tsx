'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthLoadingOverlay } from '@/components/auth/AuthLoadingOverlay';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const splashTimer = window.setTimeout(() => {
      router.replace('/login');
    }, 3000);

    return () => window.clearTimeout(splashTimer);
  }, [router]);

  return <AuthLoadingOverlay message="G Genuine — Trust, Build, Grow" />;
}
