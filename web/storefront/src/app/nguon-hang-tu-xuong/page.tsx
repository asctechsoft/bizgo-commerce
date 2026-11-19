import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/PageHead';
import { btnOutline, btnPrimary, IconTile, InfoHero, SectionTitle } from '@/components/InfoHero';

interface Item {
  icon: string;
  title: string;
  text: string;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('info.sourcing');
  return { title: t('title') };
}

export default async function FactorySourcingPage() {
  const t = await getTranslations('info');
  const s = await getTranslations('info.sourcing');
  const steps = s.raw('steps') as Item[];
  const why = s.raw('why') as Item[];

  return (
    <div>
      <PageHead crumbs={[{ label: s('crumb') }]} />
      <InfoHero
        eyebrow={s('eyebrow')}
        title={s('title')}
        sub={s('sub')}
        image="/blog/hero_factory_sourcing.png"
        actions={
          <>
            <Link href="/mua-si" className={btnPrimary}>
              {t('heroPrimary')}
            </Link>
            <Link href="/danh-muc" className={btnOutline}>
              {t('heroSecondary')}
            </Link>
          </>
        }
      />

      <SectionTitle id="sourcing-process" title={s('processTitle')} sub={s('processSub')} />
      <ol
        aria-labelledby="sourcing-process"
        className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 md:grid-cols-4"
      >
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-3 rounded-[15px] border border-line bg-white p-4"
          >
            <IconTile>{step.icon}</IconTile>
            <div>
              <p className="m-0 text-[13px] font-extrabold">
                <span className="mr-1.5 rounded-full bg-green-mint px-1.5 py-0.5 text-[11px] text-green">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {step.title}
              </p>
              <p className="m-0 mt-1.5 text-xs leading-relaxed text-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <SectionTitle id="sourcing-why" title={s('whyTitle')} />
      <ul
        aria-labelledby="sourcing-why"
        className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 md:grid-cols-4"
      >
        {why.map((w) => (
          <li key={w.title} className="flex items-start gap-3">
            <IconTile>{w.icon}</IconTile>
            <div>
              <p className="m-0 text-[14px] font-extrabold">{w.title}</p>
              <p className="m-0 mt-1 text-xs leading-relaxed text-muted">{w.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-9 flex flex-col items-center gap-4 overflow-hidden rounded-[20px] bg-gradient-to-r from-[#e6f6e4] to-[#f3faf0] px-5 py-5 sm:flex-row sm:px-8">
        <div className="relative h-[110px] w-[150px] shrink-0">
          <Image
            src="/blog/img_bizgo_boxes.png"
            alt=""
            fill
            sizes="150px"
            className="object-contain"
          />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h2 className="m-0 text-[19px] font-extrabold text-[#133e24] sm:text-[22px]">
            {s('ctaTitle')}
          </h2>
          <p className="m-0 mt-1.5 text-[13px] text-muted">{s('ctaText')}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/mua-si" className={btnPrimary}>
            {t('contactWholesale')}
          </Link>
          <Link href="/danh-muc" className={btnOutline}>
            {t('viewCatalog')}
          </Link>
        </div>
      </section>
    </div>
  );
}
