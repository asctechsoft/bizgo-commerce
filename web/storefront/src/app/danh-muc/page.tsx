import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@bizgo/ui-web';
import { PageHead } from '@/components/PageHead';
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
  const current = categories.find((c) => c.slug === params.category);
  const title = params.search
    ? t('searchResultTitle', { query: params.search })
    : (current?.name ?? t('heading'));
  const sideItem = (active: boolean) =>
    `block w-full rounded-lg px-[5px] py-2.5 text-left text-[11px] ${
      active
        ? 'bg-green-mint font-bold text-green'
        : 'text-[#506559] hover:bg-green-mint hover:text-green'
    }`;
  const chip = (active: boolean) =>
    `inline-flex min-h-tap items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold ${
      active
        ? 'border-green bg-green text-white'
        : 'border-line bg-white text-ink hover:bg-green-mint'
    }`;

  return (
    <div>
      <PageHead
        crumbs={[{ label: current?.name ?? t('title') }]}
        title={title}
        sub={t('subtitle')}
      />

      {/* phones: horizontally scrollable chips (prototype .mobile-filter) */}
      <nav
        aria-label={t('title')}
        className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2 md:hidden"
      >
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

      <div className="mt-5 grid gap-[25px] md:grid-cols-[235px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-[17px] border border-line bg-white p-5 md:block">
          <h2 className="mb-[13px] mt-0 text-[13px]">{t('sidebarTitle')}</h2>
          <nav aria-label={t('sidebarTitle')}>
            <Link
              href={catalogHref({ search: params.search, sort: params.sort })}
              aria-current={!params.category ? 'page' : undefined}
              className={sideItem(!params.category)}
            >
              {t('allCategories')}
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={catalogHref({ category: c.slug, search: params.search, sort: params.sort })}
                aria-current={params.category === c.slug ? 'page' : undefined}
                className={sideItem(params.category === c.slug)}
              >
                {c.name}
              </Link>
            ))}
          </nav>
          <hr className="my-[17px] border-0 border-t border-line" />
          <h2 className="mb-[13px] mt-0 text-[13px]">{t('sellStatusTitle')}</h2>
          <p className="m-0 text-[12px] leading-[1.9] text-muted">{t('sellStatusText')}</p>
        </aside>

        <div className="min-w-0">
          <form
            id="tim-kiem"
            action="/danh-muc"
            method="get"
            className="mb-[18px] flex flex-wrap items-center justify-between gap-2.5"
          >
            {params.category ? (
              <input type="hidden" name="category" value={params.category} />
            ) : null}
            {params.search ? <input type="hidden" name="search" value={params.search} /> : null}
            <p role="status" className="m-0 text-[12px] text-muted">
              {t('showing', { count: result.total })}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="catalog-sort" className="sr-only">
                {t('sortLabel')}
              </label>
              <select
                id="catalog-sort"
                name="sort"
                defaultValue={params.sort}
                className="min-h-[40px] max-w-[190px] rounded-[9px] border border-line bg-white px-2.5 text-[13px]"
              >
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`sort.${s}`)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="min-h-[40px] rounded-[9px] bg-green px-4 text-[12px] font-bold text-white hover:bg-green-deep"
              >
                {t('apply')}
              </button>
            </div>
          </form>

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
      </div>
    </div>
  );
}
