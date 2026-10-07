'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthLoadingOverlay } from '@/components/auth/AuthLoadingOverlay';

export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsNavigating(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, [pathname]);

  useEffect(() => {
    const startNavigation = () => {
      setIsNavigating(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsNavigating(false);
        timeoutRef.current = null;
      }, 15000);
    };

    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === pathname) return;
      startNavigation();
    };

    const handleHistoryNavigation = () => startNavigation();
    const handleWorkspaceRefreshStart = () => startNavigation();
    const handleWorkspaceRefreshEnd = () => {
      setIsNavigating(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };

    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handleHistoryNavigation);
    window.addEventListener('genuine:workspace-refresh-start', handleWorkspaceRefreshStart);
    window.addEventListener('genuine:workspace-refresh-end', handleWorkspaceRefreshEnd);
    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('popstate', handleHistoryNavigation);
      window.removeEventListener('genuine:workspace-refresh-start', handleWorkspaceRefreshStart);
      window.removeEventListener('genuine:workspace-refresh-end', handleWorkspaceRefreshEnd);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pathname]);

  return isNavigating ? <AuthLoadingOverlay message="Loading your workspace…" /> : null;
}
