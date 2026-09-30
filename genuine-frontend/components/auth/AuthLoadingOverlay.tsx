'use client';

import Image from 'next/image';

export function AuthLoadingOverlay({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#20211f]/75 backdrop-blur-md"
    >
      <div className="relative flex flex-col items-center">
        <div className="relative flex h-40 w-40 items-center justify-center">
          <svg viewBox="0 0 160 160" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="none"
              stroke="#d8f04b"
              strokeWidth="4"
              strokeDasharray="128 287"
              strokeLinecap="butt"
              className="origin-center animate-spin motion-reduce:animate-none"
              style={{ animationDuration: '3.2s' }}
            />
            <circle
              cx="80"
              cy="80"
              r="56"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeDasharray="104 248"
              strokeLinecap="butt"
              className="origin-center motion-reduce:animate-none"
              style={{ animation: 'auth-loader-spin 2.4s linear infinite reverse' }}
            />
          </svg>
          <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[#101b2e] shadow-lg shadow-black/20">
            <Image
              src="/GGENUINE_FULL_BRAND_PACKAGE/logos/png/g-genuine-symbol-128x128.png"
              alt="G Genuine"
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
            />
          </div>
        </div>
        <p className="mt-5 text-center text-base font-semibold tracking-wide text-white">
          {message}
        </p>
      </div>
      <style jsx>{`
        @keyframes auth-loader-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
