'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

const BANNERS = ['/hero/hero1.jpg', '/hero/hero2.jpg', '/hero/hero3.jpg'] as const;

/**
 * Banner slider (state in component, not global; ADR-0011). Auto-advances unless the user prefers
 * reduced motion; pauses on hover/focus. Banner copy is static until CMS banners exist (Phase 4).
 */
export function Hero() {
  const t = useTranslations('hero');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      if (!reduce.current) setIndex((i) => (i + 1) % BANNERS.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [paused]);

  const slides = t.raw('slides') as { title: string; text: string }[];
  const slide = slides[index] as { title: string; text: string };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t('carousel')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative mt-5 flex min-h-[330px] items-center overflow-hidden rounded-[22px] bg-[#ecf8e9] bg-cover bg-center sm:min-h-[295px] md:min-h-[335px]"
      style={{ backgroundImage: `url('${BANNERS[index]}')` }}
    >
      {/* readability scrim: strong on mobile where text spans the image */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[#edf9eaf2] via-[#edf9eac9] to-transparent sm:from-[#edf9eae6] sm:via-[#edf9ea99]"
      />
      <div className="relative z-10 w-[82%] max-w-[565px] px-[7%] py-8 sm:w-[60%] md:w-[55%]">
        <p className="m-0 text-[11px] font-extrabold uppercase tracking-[1.4px] text-[#2f7d45]">
          {t('eyebrow')}
        </p>
        <div aria-live="polite">
          <h1 className="my-3 text-[27px] font-extrabold leading-[1.23] text-[#133e24] md:text-[40px]">
            {slide.title}
          </h1>
          <p className="m-0 max-w-[450px] text-[14px] leading-[1.75] text-[#3d5d44]">
            {slide.text}
          </p>
        </div>
        <Link
          href="/danh-muc"
          className="mt-5 inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white hover:bg-green-deep"
        >
          {t('cta')} →
        </Link>
      </div>
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
        {BANNERS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={t('bannerLabel', { n: i + 1 })}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className="flex min-h-tap min-w-[28px] items-center justify-center"
          >
            <span
              className={`block h-2 rounded-full transition-all ${i === index ? 'w-6 bg-green' : 'w-2 bg-[#9fb7a4]'}`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
