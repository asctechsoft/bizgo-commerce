import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * Hero panel shared by the four "Home benefit" content pages (green gradient card, text left, image right).
 * Content pages are static marketing copy: no prices, stock or delivery promises are stated here.
 */
export function InfoHero({
  eyebrow,
  title,
  sub,
  image,
  imageAlt = '',
  badges,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub: string;
  image: string;
  imageAlt?: string;
  badges?: string[];
  actions?: ReactNode;
}) {
  return (
    <section className="relative mt-2 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#e6f6e4] via-[#eef9ea] to-[#f6fbf3]">
      <div className="relative z-10 grid items-center gap-2 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="px-5 py-7 sm:px-9 sm:py-10">
          {eyebrow ? (
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[1.4px] text-[#2f7d45]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="my-3 text-[27px] font-extrabold leading-[1.2] text-[#133e24] md:text-[40px]">
            {title}
          </h1>
          <p className="m-0 max-w-[480px] text-[14px] leading-[1.75] text-[#3d5d44]">{sub}</p>
          {badges && badges.length > 0 ? (
            <ul className="m-0 mt-5 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[13px] font-semibold text-[#1d4a2e]">
              {badges.map((b) => (
                <li key={b} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-green">
                    ✓
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
          {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        <div className="relative h-[190px] sm:h-[250px] md:h-full md:min-h-[300px]">
          <Image
            src={image}
            alt={imageAlt}
            fill
            priority
            sizes="(max-width: 980px) 100vw, 50vw"
            className="object-contain object-bottom md:object-right"
          />
        </div>
      </div>
    </section>
  );
}

export const btnPrimary =
  'inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white hover:bg-green-deep';
export const btnOutline =
  'inline-flex min-h-tap items-center rounded-control border border-green bg-white px-5 text-[13px] font-bold text-green hover:bg-green-mint';

/** Small mint tile that holds an emoji icon (emoji are decorative; text next to them carries the meaning). */
export function IconTile({ children, size = 'md' }: { children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-[14px] bg-green-mint ${
        size === 'lg' ? 'h-16 w-16 text-3xl' : 'h-11 w-11 text-2xl'
      }`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ title, sub, id }: { title: string; sub?: string; id: string }) {
  return (
    <div className="mb-4 mt-9">
      <h2 id={id} className="m-0 text-[19px] font-extrabold text-ink sm:text-[22px]">
        {title}
      </h2>
      {sub ? <p className="m-0 mt-1.5 text-[13px] text-muted">{sub}</p> : null}
    </div>
  );
}
