import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { catalogHref, type CatalogParams } from '@/lib/catalog-params';

export async function Pagination({
  params,
  total,
  limit,
}: {
  params: CatalogParams;
  total: number;
  limit: number;
}) {
  const t = await getTranslations('catalog');
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  const link =
    'inline-flex min-h-tap min-w-tap items-center justify-center rounded-control border border-line px-4 text-[13px] font-semibold';
  return (
    <nav aria-label={t('pagination')} className="mt-8 flex items-center justify-center gap-3">
      {params.page > 1 ? (
        <Link
          rel="prev"
          href={catalogHref({ ...params, page: params.page - 1 })}
          className={`${link} hover:bg-green-mint`}
        >
          ← {t('prev')}
        </Link>
      ) : null}
      <span aria-current="page" className="text-[13px] text-muted">
        {t('page', { page: params.page, pages })}
      </span>
      {params.page < pages ? (
        <Link
          rel="next"
          href={catalogHref({ ...params, page: params.page + 1 })}
          className={`${link} hover:bg-green-mint`}
        >
          {t('next')} →
        </Link>
      ) : null}
    </nav>
  );
}
