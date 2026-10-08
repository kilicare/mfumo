'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { AuthPhotoStoryCard } from '@/components/auth/AuthPhotoStoryCard';
import { TypewriterHeading } from '@/components/auth/TypewriterHeading';

const INITIAL_STORY_IMAGE = '/images/auth-story/store.webp';

export function AuthLeftPanel() {
  const [backgroundImage, setBackgroundImage] = useState(INITIAL_STORY_IMAGE);
  const updateBackgroundImage = useCallback((image: string) => {
    setBackgroundImage(image);
  }, []);

  return (
    <aside className="relative isolate hidden min-h-screen overflow-hidden bg-[#20211f] px-8 py-10 text-white md:flex md:flex-col md:justify-between lg:px-16">
      <div
        key={backgroundImage}
        aria-hidden="true"
        className="auth-left-story-background absolute inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: `url("${backgroundImage}")` }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#171a17]/80 via-[#171a17]/70 to-[#111811]/78" aria-hidden="true" />
      <div className="absolute -right-40 -top-32 z-0 h-[32rem] w-[32rem] rounded-full border border-white/10" aria-hidden="true" />
      <div className="absolute -right-24 -top-16 z-0 h-[25rem] w-[25rem] rounded-full border border-[#d8f04b]/20" aria-hidden="true" />
      <div className="absolute -bottom-56 -left-40 z-0 h-[34rem] w-[34rem] rounded-full bg-[#d8f04b]/[0.07] blur-3xl" aria-hidden="true" />

      <Link href="/login" className="relative z-10 flex w-fit items-center gap-3" aria-label="Genuine home">
        <Image
          src="/GGENUINE_FULL_BRAND_PACKAGE/logos/svg/logo-horizontal-white.svg"
          alt=""
          aria-hidden="true"
          width={900}
          height={220}
          priority
          className="h-auto w-[220px]"
        />
      </Link>

      <div className="relative z-10 max-w-lg pb-16">
        <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#d8f04b]"><span className="h-px w-7 bg-[#d8f04b]" /> One clear view of your business</p>
        <TypewriterHeading text="Run every part of your business with confidence." />
        <p className="mt-6 max-w-md text-base leading-7 text-white/75">Sales, stock, purchasing and finance, connected in one thoughtful workspace.</p>
        <AuthPhotoStoryCard onStoryImageChange={updateBackgroundImage} />
      </div>
      <p className="relative z-10 text-xs tracking-wide text-white/60">© 2026 Genuine Business Suite</p>
      <style jsx>{`
        .auth-left-story-background {
          animation: auth-left-story-arrive 560ms ease both;
        }
        @keyframes auth-left-story-arrive {
          from { opacity: 0.55; transform: scale(1.025); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-left-story-background { animation: none; }
        }
      `}</style>
    </aside>
  );
}
