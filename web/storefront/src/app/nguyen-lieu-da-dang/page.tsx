import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';
import { CategoryGrid } from '@/components/CategoryGrid';
import { btnPrimary, InfoHero, SectionTitle } from '@/components/InfoHero';
import { PageHead } from '@/components/PageHead';
import { ProductGrid } from '@/components/ProductCard';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('info.diverse');
  return { title: t('title') };
}

export default async function DiverseMaterialsPage() {
  const d = await getTranslations('info.diverse');
  const home = await getTranslations('home');
  // Real data only: categories and products come from the API (no fixtures, no invented counts).
  const [categories, products] = await Promise.all([
    serverApi().catalog.categories(),
    serverApi().catalog.products({ limit: 8, sort: 'newest' }),
  ]);

  return (
    <div>
      <PageHead crumbs={[{ label: d('crumb') }]} />
      <InfoHero
        eyebrow={d('eyebrow')}
        title={d('title')}
        sub={d('sub')}
        image="/blog/hero_diverse_materials.png"
        actions={
          <Link href="/danh-muc" className={btnPrimary}>
            {d('cta')}
          </Link>
        }
      />

      <div className="mt-6">
        <CategoryGrid categories={categories} />
      </div>

      <section aria-labelledby="diverse-products">
        <div className="flex items-end justify-between gap-3">
          <SectionTitle id="diverse-products" title={d('productsTitle')} sub={d('productsSub')} />
          <Link
            href="/danh-muc"
            className="mb-4 whitespace-nowrap text-[13px] font-bold text-green"
          >
            {d('more')}
          </Link>
        </div>
        {products.items.length > 0 ? (
          <ProductGrid products={products.items} />
        ) : (
          <EmptyState title={home('emptyTitle')} description={home('emptyText')} icon="🥣" />
        )}
      </section>
    </div>
  );
}
