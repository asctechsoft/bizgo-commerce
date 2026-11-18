import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';
import { Benefits } from '@/components/Benefits';
import { CategoryGrid } from '@/components/CategoryGrid';
import { Hero } from '@/components/Hero';
import { ProductGrid } from '@/components/ProductCard';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const t = await getTranslations('home');
  // No try/catch: an API failure must show the error boundary, never silently fall back to fixtures.
  const [categories, products] = await Promise.all([
    serverApi().catalog.categories(),
    serverApi().catalog.products({ limit: 8, sort: 'newest' }),
  ]);
  return (
    <>
      <Hero />
      <Benefits />
      <section aria-labelledby="home-categories" className="mt-9">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 id="home-categories" className="m-0 text-xl font-extrabold sm:text-2xl">
              {t('categoriesTitle')}
            </h2>
            <p className="mt-1.5 text-[13px] text-muted">{t('categoriesSubtitle')}</p>
          </div>
          <Link href="/danh-muc" className="whitespace-nowrap text-[13px] font-bold text-green">
            {t('viewAll')}
          </Link>
        </div>
        <CategoryGrid categories={categories} />
      </section>
      <section
        aria-labelledby="home-promo"
        className="mt-[42px] flex flex-col items-start justify-between gap-[25px] rounded-[20px] bg-gradient-to-br from-[#155e36] to-[#309c59] px-[23px] py-[27px] text-white sm:flex-row sm:items-center sm:px-[35px]"
      >
        <div>
          <h2 id="home-promo" className="mb-2 mt-0 text-[19px] font-extrabold sm:text-[23px]">
            {t('promoTitle')}
          </h2>
          <p className="m-0 text-[12px] text-[#dbf3e4]">{t('promoText')}</p>
        </div>
        <Link
          href="/mua-si"
          className="inline-flex min-h-tap shrink-0 items-center rounded-[11px] border border-white bg-white px-[18px] text-[12px] font-bold text-green"
        >
          {t('promoCta')}
        </Link>
      </section>
      <section aria-labelledby="home-products" className="mt-[38px]">
        <div className="mb-[19px] flex items-end justify-between gap-3">
          <div>
            <h2 id="home-products" className="m-0 text-xl font-extrabold sm:text-2xl">
              {t('productsTitle')}
            </h2>
            <p className="mt-1.5 text-[12px] text-muted">{t('productsSubtitle')}</p>
          </div>
          <Link href="/danh-muc" className="whitespace-nowrap text-[12px] font-bold text-green">
            {t('moreLink')}
          </Link>
        </div>
        {products.items.length > 0 ? (
          <ProductGrid products={products.items} />
        ) : (
          <EmptyState title={t('emptyTitle')} description={t('emptyText')} icon="🥣" />
        )}
      </section>
    </>
  );
}
