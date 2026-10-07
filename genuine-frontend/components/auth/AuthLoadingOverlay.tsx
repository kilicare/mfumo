'use client';

import Image from 'next/image';

export function AuthLoadingOverlay({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#172018]/40 backdrop-blur-xl"
    >
      <div className="relative flex flex-col items-center">
        <div className="relative flex h-[120px] w-[120px] items-center justify-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <circle
              cx="60"
              cy="60"
              r="53"
              fill="none"
              stroke="#d8b454"
              strokeWidth="3.5"
              strokeDasharray="72 261"
              strokeLinecap="butt"
              className="origin-center animate-spin motion-reduce:animate-none"
              style={{ animationDuration: '3.8s' }}
            />
            <circle
              cx="60"
              cy="60"
              r="43"
              fill="none"
              stroke="#e9dfbd"
              strokeWidth="3"
              strokeDasharray="57 213"
              strokeLinecap="butt"
              className="origin-center motion-reduce:animate-none"
              style={{ animation: 'auth-loader-spin 2.8s linear infinite reverse' }}
            />
            <circle
              cx="60"
              cy="60"
              r="33"
              fill="none"
              stroke="#91b59d"
              strokeWidth="2.5"
              strokeDasharray="42 165"
              strokeLinecap="butt"
              className="origin-center animate-spin motion-reduce:animate-none"
              style={{ animationDuration: '2.1s' }}
            />
          </svg>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#101b2e] shadow-lg shadow-black/20">
            <Image
              src="/GGENUINE_FULL_BRAND_PACKAGE/logos/png/g-genuine-symbol-128x128.png"
              alt="G Genuine"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          </div>
        </div>
        <p className="mt-4 text-center text-sm font-semibold tracking-wide text-white">
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
