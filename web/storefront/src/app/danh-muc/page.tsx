import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';
import { Pagination } from '@/components/Pagination';
import { ProductGrid } from '@/components/ProductCard';
import { serverApi } from '@/lib/api';
import { catalogHref, parseCatalogParams, SORTS } from '@/lib/catalog-params';

export const dynamic = 'force-dynamic';
const LIMIT = 24;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('catalog');
  return { title: t('title') };
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('catalog');
  const params = parseCatalogParams(await searchParams);
  const api = serverApi();
  const [categories, result] = await Promise.all([
    api.catalog.categories(),
    api.catalog.products({
      category: params.category,
      search: params.search,
      sort: params.sort,
      page: params.page,
      limit: LIMIT,
    }),
  ]);
  const chip = (active: boolean) =>
    `inline-flex min-h-tap items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold ${
      active
        ? 'border-green bg-green text-white'
        : 'border-line bg-white text-ink hover:bg-green-mint'
    }`;

  return (
    <div className="pt-6">
      <h1 className="m-0 text-2xl font-extrabold">{t('title')}</h1>

      <nav aria-label={t('title')} className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
        <Link
          href={catalogHref({ search: params.search, sort: params.sort })}
          aria-current={!params.category ? 'page' : undefined}
          className={chip(!params.category)}
        >
          {t('allCategories')}
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={catalogHref({ category: c.slug, search: params.search, sort: params.sort })}
            aria-current={params.category === c.slug ? 'page' : undefined}
            className={chip(params.category === c.slug)}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <form
        id="tim-kiem"
        action="/danh-muc"
        method="get"
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
        <div className="flex-1">
          <label htmlFor="catalog-search" className="mb-1.5 block text-[13px] font-semibold">
            {t('searchLabel')}
          </label>
          <input
            id="catalog-search"
            name="search"
            type="search"
            maxLength={100}
            defaultValue={params.search ?? ''}
            className="min-h-tap w-full rounded-control border border-line px-3 text-[14px]"
          />
        </div>
        <div>
          <label htmlFor="catalog-sort" className="mb-1.5 block text-[13px] font-semibold">
            {t('sortLabel')}
          </label>
          <select
            id="catalog-sort"
            name="sort"
            defaultValue={params.sort}
            className="min-h-tap w-full rounded-control border border-line bg-white px-3 text-[14px] sm:w-auto"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-tap rounded-control bg-green px-5 text-[13px] font-bold text-white hover:bg-green-deep"
        >
          {t('apply')}
        </button>
      </form>

      <p role="status" className="mb-4 mt-6 text-[13px] text-muted">
        {t('resultCount', { count: result.total })}
      </p>

      {result.items.length > 0 ? (
        <>
          <ProductGrid products={result.items} />
          <Pagination params={params} total={result.total} limit={LIMIT} />
        </>
      ) : params.search ? (
        <EmptyState
          title={t('emptySearchTitle')}
          description={t('emptySearchText', { query: params.search })}
          icon="🔍"
          action={
            <Link
              href="/danh-muc"
              className="inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white"
            >
              {t('clearFilters')}
            </Link>
          }
        />
      ) : (
        <EmptyState title={t('emptyTitle')} description={t('emptyText')} icon="🥣" />
      )}
    </div>
  );
}
