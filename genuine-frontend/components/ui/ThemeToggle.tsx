'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-pressed={isDark}
      disabled={!mounted}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#e8e9e5] bg-white text-[#4f544c] transition hover:bg-[#f1f2ee] disabled:opacity-70 dark:border-[#353b34] dark:bg-[#1b1f1a] dark:text-[#e9ede5] dark:hover:bg-[#282e27] sm:h-10 sm:w-10"
    >
      {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
