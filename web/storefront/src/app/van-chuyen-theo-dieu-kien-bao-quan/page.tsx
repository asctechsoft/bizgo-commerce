import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/PageHead';
import { btnOutline, btnPrimary, InfoHero, SectionTitle } from '@/components/InfoHero';

const TYPE_ICONS = [
  '/blog/icon_dry_goods.png',
  '/blog/icon_chilled_goods.png',
  '/blog/icon_same_day_delivery.png',
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('info.shipping');
  return { title: t('title') };
}

export default async function ShippingConditionsPage() {
  const s = await getTranslations('info.shipping');
  const types = s.raw('types') as { title: string; text: string; note: string }[];
  const head = s.raw('rulesHead') as string[];
  const rules = s.raw('rules') as { type: string; condition: string; time: string; care: string }[];

  return (
    <div>
      <PageHead crumbs={[{ label: s('crumb') }]} />
      <InfoHero
        title={s('title')}
        sub={s('sub')}
        image="/blog/hero_storage_shipping.png"
        badges={s.raw('badges') as string[]}
      />

      <SectionTitle id="ship-types" title={s('typesTitle')} sub={s('typesSub')} />
      <ul aria-labelledby="ship-types" className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {types.map((ty, i) => (
          <li key={ty.title} className="flex gap-4 rounded-[15px] border border-line bg-white p-4">
            <div className="relative h-[84px] w-[84px] shrink-0 rounded-[14px] bg-green-mint">
              <Image
                src={TYPE_ICONS[i] ?? TYPE_ICONS[0]}
                alt=""
                fill
                sizes="84px"
                className="object-contain p-2"
              />
            </div>
            <div className="min-w-0">
              <h3 className="m-0 text-[15px] font-extrabold">{ty.title}</h3>
              <p className="m-0 mt-1 text-xs leading-relaxed text-muted">{ty.text}</p>
              <p className="m-0 mt-2.5 inline-block rounded-lg bg-green-mint px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-green">
                <span aria-hidden="true">✓ </span>
                {ty.note}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <section
        aria-labelledby="ship-area"
        className="mt-5 flex flex-col items-center gap-5 rounded-[15px] border border-line bg-gradient-to-r from-[#f1faee] to-white p-5 sm:flex-row"
      >
        <div className="relative h-[130px] w-[90px] shrink-0">
          <Image
            src="/blog/img_vietnam_map.png"
            alt=""
            fill
            sizes="90px"
            className="object-contain"
          />
        </div>
        <div>
          <h2 id="ship-area" className="m-0 text-[17px] font-extrabold">
            {s('areaTitle')}
          </h2>
          <p className="m-0 mt-1.5 max-w-[640px] text-[13px] leading-relaxed text-muted">
            {s('areaText')}
          </p>
        </div>
      </section>

      <SectionTitle id="ship-rules" title={s('rulesTitle')} />
      {/* Desktop: real table. Phones: stacked cards so nothing scrolls sideways at 320px. */}
      <div className="hidden overflow-hidden rounded-[15px] border border-line bg-white md:block">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="bg-green-mint text-[#1d4a2e]">
              {head.map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-extrabold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.type} className="border-t border-line align-top">
                <th scope="row" className="px-4 py-3 font-bold">
                  {r.type}
                </th>
                <td className="px-4 py-3 text-muted">{r.condition}</td>
                <td className="px-4 py-3 text-muted">{r.time}</td>
                <td className="px-4 py-3 text-muted">{r.care}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 grid list-none gap-3 p-0 md:hidden">
        {rules.map((r) => (
          <li key={r.type} className="rounded-[15px] border border-line bg-white p-4 text-[13px]">
            <p className="m-0 font-extrabold">{r.type}</p>
            <dl className="m-0 mt-2 grid gap-2 text-xs">
              {(
                [
                  [head[1], r.condition],
                  [head[2], r.time],
                  [head[3], r.care],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="font-bold text-ink">{k}</dt>
                  <dd className="m-0 text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <section className="flex flex-col items-start justify-between gap-3 rounded-[15px] bg-green-mint p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="m-0 text-[15px] font-extrabold">{s('checkTitle')}</h2>
            <p className="m-0 mt-1 text-xs text-muted">{s('checkText')}</p>
          </div>
          <Link href="/gio-hang" className={`${btnPrimary} shrink-0`}>
            {s('checkCta')}
          </Link>
        </section>
        <section className="flex flex-col items-start justify-between gap-3 rounded-[15px] bg-green-mint p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="m-0 text-[15px] font-extrabold">
              {(await getTranslations('info'))('contactAdvice')}
            </h2>
            <p className="m-0 mt-1 text-xs text-muted">{s('adviceText')}</p>
          </div>
          <Link href="/lien-he" className={`${btnOutline} shrink-0`}>
            {s('adviceCta')}
          </Link>
        </section>
      </div>
    </div>
  );
}
