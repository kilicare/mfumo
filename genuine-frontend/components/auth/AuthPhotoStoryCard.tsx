'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  ShoppingCart,
  Store,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

type StorySlide = {
  title: string;
  category: string;
  Icon: LucideIcon;
  palette: string;
  image?: string;
};

const slides: StorySlide[] = [
  { title: 'A store built on trust', category: 'Genuine Business Suite', Icon: Store, palette: 'from-[#56613a] via-[#28352b] to-[#171d19]', image: '/images/auth-story/store.webp' },
  { title: 'Sales, made clearer', category: 'Sales', Icon: ShoppingCart, palette: 'from-[#82653a] via-[#3c3528] to-[#1b1d18]', image: '/images/auth-story/sales.webp' },
  { title: 'Stock, always in view', category: 'Inventory', Icon: Boxes, palette: 'from-[#446657] via-[#263a32] to-[#171d19]', image: '/images/auth-story/inventory.webp' },
  { title: 'Know your numbers', category: 'Finance', Icon: BarChart3, palette: 'from-[#65543b] via-[#353227] to-[#1a1d19]', image: '/images/auth-story/operations.webp' },
  { title: 'Your team, in sync', category: 'People & operations', Icon: UsersRound, palette: 'from-[#4c5c64] via-[#2a3638] to-[#171d19]', image: '/images/auth-story/team.webp' },
];

export function AuthPhotoStoryCard({
  onStoryImageChange,
}: {
  onStoryImageChange?: (image: string) => void;
}) {
  const [active, setActive] = useState(0);
  const [turning, setTurning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pendingDirection = useRef<-1 | 1>(1);
  const slide = slides[active];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || turning) return;
    const beginTurn = window.setTimeout(() => {
      pendingDirection.current = 1;
      setTurning(true);
    }, 3900);
    return () => window.clearTimeout(beginTurn);
  }, [active, paused, reducedMotion, turning]);

  useEffect(() => {
    if (slide.image) onStoryImageChange?.(slide.image);
  }, [slide.image, onStoryImageChange]);

  function turnPage(direction: -1 | 1) {
    if (turning) return;
    if (reducedMotion) {
      setActive((index) => (index + direction + slides.length) % slides.length);
      return;
    }
    pendingDirection.current = direction;
    setTurning(true);
  }

  function finishPageTurn(event: React.AnimationEvent<HTMLDivElement>) {
    if (!['auth-story-turn-next', 'auth-story-turn-prev'].includes(event.animationName)) return;
    setActive((index) => (index + pendingDirection.current + slides.length) % slides.length);
    setTurning(false);
  }

  const Icon = slide.Icon;

  return (
    <section
      aria-label="Genuine Business Suite stories"
      className="mt-8 w-full max-w-[587px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="relative isolate h-[205px] w-full [perspective:1100px] sm:h-[210px]">
        {([-2, -1, 1, 2] as const).map((offset) => {
          const depth = Math.abs(offset);
          const behind = slides[(active + offset + slides.length) % slides.length];
          const BehindIcon = behind.Icon;
          return (
            <div
              key={`${active}-${offset}`}
              aria-hidden="true"
              className={`absolute left-1/2 top-1/2 h-[164px] w-[61%] -translate-y-1/2 overflow-hidden rounded-[21px] border border-white/15 bg-gradient-to-br ${behind.palette} shadow-xl`}
              style={{
                transform: `translate(calc(-50% + ${offset * (depth === 1 ? 72 : 137)}px), calc(-50% + ${depth * 5}px)) rotate(${offset * 2.2}deg) scale(${1 - depth * 0.035})`,
                zIndex: depth === 1 ? 3 : 2,
              }}
            >
              {behind.image ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${behind.image}")` }} /> : <BehindIcon className="absolute right-5 top-4 h-20 w-20 text-white/15" strokeWidth={1} />}
              <div className="absolute inset-0 bg-gradient-to-r from-[#111713]/55 via-[#111713]/10 to-[#111713]/35" />
            </div>
          );
        })}

        <div
          key={active}
          aria-live="polite"
          onAnimationEnd={finishPageTurn}
          className={`auth-story-page absolute left-[18%] top-[2px] h-[178px] w-[66%] overflow-hidden rounded-[22px] border border-[#d8f04b]/45 bg-gradient-to-br ${slide.palette} shadow-[0_20px_48px_rgba(0,0,0,0.38)] ${turning ? pendingDirection.current === 1 ? 'auth-story-page-turn-next' : 'auth-story-page-turn-prev' : ''}`}
          style={{ transformOrigin: 'left center', zIndex: 4 }}
        >
          {slide.image ? <div className="auth-story-image absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${slide.image}")` }} /> : <Icon className="absolute right-5 top-3 h-24 w-24 text-white/[0.1]" strokeWidth={0.8} aria-hidden="true" />}
          <div className="absolute inset-0 bg-gradient-to-br from-black/5 via-black/10 to-[#0b100d]/75" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 border-t border-white/10 bg-[#111713]/75 px-4 py-3 backdrop-blur-md sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{slide.title}</p>
              <p className="mt-1 text-[11px] text-white/65">Sales · Stock · Finance · More</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d8f04b]">G Genuine</p>
              <p className="mt-1 text-[10px] text-white/65">{String(active + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</p>
            </div>
          </div>
          <span className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-black/20 text-[#d8f04b] backdrop-blur-sm" aria-hidden="true"><Icon size={18} /></span>
        </div>

        <button type="button" disabled={turning} onClick={() => turnPage(-1)} aria-label="Previous story" className="absolute left-0 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-white/[0.09] text-white/85 backdrop-blur-md transition hover:bg-white/[0.18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d8f04b] disabled:cursor-wait disabled:opacity-50"><ArrowLeft size={16} /></button>
        <button type="button" disabled={turning} onClick={() => turnPage(1)} aria-label="Next story" className="absolute right-0 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-white/[0.09] text-white/85 backdrop-blur-md transition hover:bg-white/[0.18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d8f04b] disabled:cursor-wait disabled:opacity-50"><ArrowRight size={16} /></button>
      </div>
      <div className="mt-2 flex justify-center gap-1.5" role="group" aria-label="Choose a business story">
        {slides.map((item, index) => (
          <button key={item.category} type="button" disabled={turning} onClick={() => setActive(index)} aria-label={`Show story ${index + 1}: ${item.category}`} aria-current={index === active ? 'true' : undefined} className={`h-1.5 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d8f04b] disabled:cursor-wait ${index === active ? 'w-7 bg-[#d8f04b]' : 'w-3 bg-white/30 hover:bg-white/55'}`} />
        ))}
      </div>
      <style jsx>{`
        .auth-story-page:not(.auth-story-page-turn-next):not(.auth-story-page-turn-prev) {
          transition: border-color 280ms ease, box-shadow 280ms ease;
        }
        .auth-story-page:not(.auth-story-page-turn-next):not(.auth-story-page-turn-prev):hover {
          border-color: rgba(216, 240, 75, 0.82);
          box-shadow: 0 24px 58px rgba(0, 0, 0, 0.48), 0 0 22px rgba(216, 240, 75, 0.13);
        }
        .auth-story-image {
          transition: transform 650ms cubic-bezier(.2,.7,.2,1);
        }
        .auth-story-page:not(.auth-story-page-turn-next):not(.auth-story-page-turn-prev):hover .auth-story-image {
          transform: scale(1.045);
        }
        .auth-story-page-turn-next { animation: auth-story-turn-next 820ms cubic-bezier(.55,.08,.34,1) both; }
        .auth-story-page-turn-prev { animation: auth-story-turn-prev 820ms cubic-bezier(.55,.08,.34,1) both; }
        @keyframes auth-story-turn-next {
          0% { transform: rotateY(0) translateX(0); filter: brightness(1); }
          38% { transform: rotateY(-36deg) translateX(-7px); filter: brightness(.82); }
          100% { transform: rotateY(-88deg) translateX(-16px); filter: brightness(.58); }
        }
        @keyframes auth-story-turn-prev {
          0% { transform: rotateY(0) translateX(0); filter: brightness(1); }
          38% { transform: rotateY(36deg) translateX(7px); filter: brightness(.82); }
          100% { transform: rotateY(88deg) translateX(16px); filter: brightness(.58); }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-story-page, .auth-story-image { transition: none !important; }
          .auth-story-page:not(.auth-story-page-turn-next):not(.auth-story-page-turn-prev):hover .auth-story-image { transform: none; }
          .auth-story-page-turn-next, .auth-story-page-turn-prev { animation: none; }
        }
      `}</style>
    </section>
  );
}
