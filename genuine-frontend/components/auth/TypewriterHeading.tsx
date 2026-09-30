'use client';

import { useEffect, useState } from 'react';

export function TypewriterHeading({ text }: { text: string }) {
  const [typedText, setTypedText] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedText(text);
      setComplete(true);
      return;
    }

    let character = 0;
    const timer = window.setInterval(() => {
      character += 1;
      setTypedText(text.slice(0, character));
      if (character >= text.length) {
        window.clearInterval(timer);
        setComplete(true);
      }
    }, 38);

    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <h1
      aria-label={text}
      className="min-h-[3.36em] max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight lg:text-5xl"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {typedText}
        <span className={`ml-1 inline-block h-[0.9em] w-px translate-y-[0.08em] bg-[#d8f04b] ${complete ? 'animate-pulse' : ''}`} />
      </span>
    </h1>
  );
}
