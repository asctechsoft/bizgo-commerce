import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';
import { IconTile, InfoHero, SectionTitle } from '@/components/InfoHero';
import { PageHead } from '@/components/PageHead';
import { ProductGrid } from '@/components/ProductCard';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Item {
  icon: string;
  title: string;
  text: string;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('info.verified');
  return { title: t('title') };
}

export default async function VerifiedGoodsPage() {
  const v = await getTranslations('info.verified');
  const criteria = v.raw('criteria') as Item[];
  const flow = v.raw('flow') as Item[];
  const assure = v.raw('assure') as string[];
  const faq = v.raw('faq') as { q: string; a: string }[];

  // Only products the API reports as sellable (ADR-0009 gate passed). Never fabricate "verified" items.
  const result = await serverApi().catalog.products({ limit: 48, sort: 'newest' });
  const sellable = result.items.filter((p) => p.sellable).slice(0, 4);

  return (
    <div>
      <PageHead crumbs={[{ label: v('crumb') }]} />
      <InfoHero
        eyebrow={v('eyebrow')}
        title={v('title')}
        sub={v('sub')}
        image="/blog/hero_verified_goods.png"
        badges={v.raw('badges') as string[]}
      />

      <SectionTitle id="verified-criteria" title={v('criteriaTitle')} sub={v('criteriaSub')} />
      <ul
        aria-labelledby="verified-criteria"
        className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 md:grid-cols-4"
      >
        {criteria.map((c) => (
          <li key={c.title} className="flex gap-3 rounded-[15px] border border-line bg-white p-4">
            <IconTile>{c.icon}</IconTile>
            <div>
              <p className="m-0 text-[13px] font-extrabold">{c.title}</p>
              <p className="m-0 mt-1.5 text-xs leading-relaxed text-muted">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="verified-products">
        <div className="flex items-end justify-between gap-3">
          <SectionTitle id="verified-products" title={v('productsTitle')} sub={v('productsSub')} />
          <Link
            href="/danh-muc"
            className="mb-4 whitespace-nowrap text-[13px] font-bold text-green"
          >
            {v('productsMore')}
          </Link>
        </div>
        {sellable.length > 0 ? (
          <ProductGrid products={sellable} />
        ) : (
          <EmptyState
            title={v('productsEmptyTitle')}
            description={v('productsEmptyText')}
            icon="🛡️"
          />
        )}
      </section>

      <section
        aria-labelledby="verified-flow"
        className="mt-9 rounded-[20px] bg-gradient-to-r from-[#e6f6e4] to-[#f3faf0] p-5 sm:p-7"
      >
        <h2
          id="verified-flow"
          className="m-0 text-[19px] font-extrabold text-[#133e24] sm:text-[22px]"
        >
          {v('flowTitle')}
        </h2>
        <p className="m-0 mt-1.5 text-[13px] text-muted">{v('flowText')}</p>
        <ol className="m-0 mt-5 grid list-none gap-4 p-0 sm:grid-cols-2 md:grid-cols-4">
          {flow.map((f) => (
            <li key={f.title} className="flex flex-col items-center text-center">
              <span
                aria-hidden="true"
                className="grid h-12 w-12 place-items-center rounded-full bg-green text-xl text-white"
              >
                {f.icon}
              </span>
              <p className="m-0 mt-2.5 text-[13px] font-extrabold">{f.title}</p>
              <p className="m-0 mt-1 text-xs text-muted">{f.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-9 grid gap-8 md:grid-cols-2">
        <section aria-labelledby="verified-assure" className="flex items-center gap-4">
          <div className="relative hidden h-[190px] w-[200px] shrink-0 sm:block">
            <Image
              src="/blog/img_verified_shield.png"
              alt=""
              fill
              sizes="200px"
              className="object-contain"
            />
          </div>
          <div>
            <h2 id="verified-assure" className="m-0 text-[19px] font-extrabold">
              {v('assureTitle')}
            </h2>
            <ul className="m-0 mt-3 list-none space-y-2 p-0 text-[13px]">
              {assure.map((a) => (
                <li key={a} className="flex gap-2">
                  <span aria-hidden="true" className="font-bold text-green">
                    ✓
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="verified-faq">
          <h2 id="verified-faq" className="m-0 text-[19px] font-extrabold">
            {v('faqTitle')}
          </h2>
          <p className="m-0 mt-1 text-xs text-muted">{v('faqSub')}</p>
          <div className="mt-3 space-y-2">
            {faq.map((f) => (
              <details
                key={f.q}
                className="group rounded-[11px] border border-line bg-white px-4 py-3 text-[13px]"
              >
                <summary className="flex min-h-[28px] cursor-pointer list-none items-center justify-between gap-3 font-bold">
                  {f.q}
                  <span aria-hidden="true" className="text-green transition group-open:rotate-180">
                    ⌄
                  </span>
                </summary>
                <p className="m-0 mt-2 text-xs leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
