'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { useTranslations } from 'next-intl';

const MIN = 1;
const MAX = 6;

/**
 * Product photo with (1) hover magnifier on pointer devices and (2) a full-screen viewer to inspect any corner:
 * wheel / buttons / keyboard (+ − 0, arrows, Esc) to zoom and pan, drag to move, double-click to toggle.
 */
export function ImageZoom({ src, alt, hint }: { src: string; alt: string; hint?: string }) {
  const t = useTranslations('zoom');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const r = e.currentTarget.getBoundingClientRect();
          setHover({
            x: ((e.clientX - r.left) / r.width) * 100,
            y: ((e.clientY - r.top) / r.height) * 100,
          });
        }}
        onPointerLeave={() => setHover(null)}
        aria-label={t('open', { name: alt })}
        className="relative block h-[320px] w-full cursor-zoom-in overflow-hidden rounded-[22px] bg-gradient-to-br from-[#f2f7f0] to-white sm:h-[440px]"
      >
        <span
          className="absolute inset-0 transition-transform duration-100 ease-out"
          style={{
            transform: hover ? 'scale(2.2)' : 'scale(1)',
            transformOrigin: hover ? `${hover.x}% ${hover.y}%` : '50% 50%',
          }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            priority
            sizes="(max-width: 980px) 100vw, 50vw"
            className="object-contain p-6"
          />
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-bold text-green shadow"
        >
          🔍 {t('hint')}
        </span>
      </button>
      {hint ? <p className="sr-only">{hint}</p> : null}
      {open ? (
        <Viewer
          src={src}
          alt={alt}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function Viewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const t = useTranslations('zoom');
  // Opens at 100%: the viewer is already full-screen, so the image fits the whole window; zoom in from there.
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const setZoom = useCallback((next: number) => {
    const s = Math.min(MAX, Math.max(MIN, next));
    setScale(s);
    if (s === MIN) setPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    dialog.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function onKey(e: React.KeyboardEvent) {
    const step = 60;
    if (e.key === 'Escape') onClose();
    else if (e.key === '+' || e.key === '=') setZoom(scale + 0.5);
    else if (e.key === '-') setZoom(scale - 0.5);
    else if (e.key === '0') setZoom(1);
    else if (e.key === 'ArrowLeft') setPos((p) => ({ ...p, x: p.x + step }));
    else if (e.key === 'ArrowRight') setPos((p) => ({ ...p, x: p.x - step }));
    else if (e.key === 'ArrowUp') setPos((p) => ({ ...p, y: p.y + step }));
    else if (e.key === 'ArrowDown') setPos((p) => ({ ...p, y: p.y - step }));
  }

  function onWheel(e: WheelEvent) {
    setZoom(scale + (e.deltaY < 0 ? 0.4 : -0.4));
  }
  function down(e: PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  }
  function move(e: PointerEvent) {
    const d = drag.current;
    if (!d || scale === MIN) return;
    setPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
  }

  const btn =
    'min-h-tap min-w-tap rounded-control bg-white/95 px-3 text-[18px] font-bold text-green hover:bg-white';
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      tabIndex={-1}
      onKeyDown={onKey}
      className="fixed inset-0 z-[100] flex flex-col bg-[#0d1f16]/95 outline-none"
    >
      <div className="flex items-center justify-between gap-3 p-3 text-white">
        <span className="truncate text-[13px] font-semibold">{alt}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => setZoom(scale - 0.5)}
            aria-label={t('out')}
          >
            −
          </button>
          <span className="w-12 text-center text-[12px]" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className={btn}
            onClick={() => setZoom(scale + 0.5)}
            aria-label={t('in')}
          >
            +
          </button>
          <button type="button" className={`${btn} text-[13px]`} onClick={() => setZoom(1)}>
            {t('reset')}
          </button>
          <button type="button" className={btn} onClick={onClose} aria-label={t('close')}>
            ✕
          </button>
        </div>
      </div>
      <div
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        onWheel={onWheel}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => setZoom(scale > 1 ? 1 : 2.5)}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: drag.current ? 'none' : 'transform 120ms ease-out',
          }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes="100vw"
            quality={95}
            draggable={false}
            className="object-contain p-4"
          />
        </div>
      </div>
      <p className="m-0 p-2 text-center text-[11px] text-white/70">{t('help')}</p>
    </div>
  );
}
