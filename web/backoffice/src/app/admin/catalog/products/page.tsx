'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminCategory, AdminProduct, Page } from '@bizgo/contracts';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '@bizgo/ui-web';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';
import { errorKey } from '@/lib/api';

const LIMIT = 20;
const STATUSES = ['DRAFT', 'UNDER_REVIEW', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;

function ProductsTable() {
  const t = useTranslations();
  const { api } = useBackoffice();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const status = sp.get('status') ?? '';
  const category = sp.get('category') ?? '';
  const search = sp.get('search') ?? '';
  const page = Math.max(1, Number(sp.get('page')) || 1);

  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [data, setData] = useState<Page<AdminProduct> | null>(null);
  const [error, setError] = useState<{ text: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.admin
      .categories()
      .then(setCats)
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api.admin
      .products({
        status: status || undefined,
        category: category || undefined,
        search: search || undefined,
        page,
        limit: LIMIT,
      })
      .then((r) => alive && setData(r))
      .catch((e) => {
        if (!alive) return;
        const k = errorKey(e);
        setError({
          text: t(k.status === 403 ? 'errors.forbidden' : k.key),
          ...(k.requestId ? { requestId: k.requestId } : {}),
        });
      });
    return () => {
      alive = false;
    };
  }, [api, status, category, search, page, reload, t]);

  function setParam(next: Record<string, string>) {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    if (!('page' in next)) q.delete('page');
    router.replace(`${pathname}?${q.toString()}`);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const sel = 'min-h-tap rounded-control border border-line bg-white px-3 text-[14px]';

  return (
    <AdminShell>
      <h1 className="m-0 text-2xl font-extrabold">{t('products.title')}</h1>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">{t('products.subtitle')}</p>

      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setParam({ search: String(new FormData(e.currentTarget).get('search') ?? '').trim() });
        }}
      >
        <div>
          <label htmlFor="f-search" className="mb-1 block text-[13px] font-semibold">
            {t('products.search')}
          </label>
          <input
            id="f-search"
            name="search"
            type="search"
            defaultValue={search}
            maxLength={100}
            className={`${sel} w-full sm:w-64`}
          />
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-[13px] font-semibold">
            {t('products.status')}
          </label>
          <select
            id="f-status"
            value={status}
            onChange={(e) => setParam({ status: e.target.value })}
            className={`${sel} w-full sm:w-44`}
          >
            <option value="">{t('common.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-cat" className="mb-1 block text-[13px] font-semibold">
            {t('products.category')}
          </label>
          <select
            id="f-cat"
            value={category}
            onChange={(e) => setParam({ category: e.target.value })}
            className={`${sel} w-full sm:w-64`}
          >
            <option value="">{t('common.all')}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.displayName} ({c.productCount})
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">{t('products.search')}</Button>
      </form>

      <div className="mt-5" aria-live="polite">
        {error ? (
          <ErrorState
            title={t('errors.title')}
            description={error.text}
            {...(error.requestId ? { requestId: error.requestId } : {})}
            action={<Button onClick={() => setReload((n) => n + 1)}>{t('common.retry')}</Button>}
          />
        ) : !data ? (
          <div aria-busy="true" className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState title={t('products.empty')} />
        ) : (
          <>
            <p className="mb-2 text-[13px] text-muted">
              {t('products.total', { count: data.total })}
            </p>
            <div className="overflow-x-auto rounded-card border border-line bg-white">
              <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                <caption className="sr-only">{t('products.title')}</caption>
                <thead className="bg-green-soft text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">
                      {t('products.colIndex')}
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      {t('products.colName')}
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      {t('products.colUnit')}
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      {t('products.colCategory')}
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      {t('products.colStatus')}
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      {t('products.colMedia')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="px-3 py-2.5 text-muted">{p.sourceIndex}</td>
                      <td className="px-3 py-2.5 font-semibold">
                        <Link
                          href={`/admin/catalog/products/${p.id}`}
                          className="text-green hover:underline"
                        >
                          {p.sourceName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">{p.sourceUnitText}</td>
                      <td className="px-3 py-2.5">{p.category.displayName}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={p.status === 'ACTIVE' ? 'green' : 'neutral'}>
                          {t(`status.${p.status}`)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {p.media[0]?.isIllustrative ? (
                          <Badge tone="orange">{t('products.mediaIllustrative')}</Badge>
                        ) : (
                          t('products.mediaNone')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <nav className="mt-4 flex items-center justify-center gap-3" aria-label="pagination">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setParam({ page: String(page - 1) })}
                >
                  {t('common.previous')}
                </Button>
                <span className="text-[13px] text-muted">{t('common.page', { page, pages })}</span>
                <Button
                  variant="secondary"
                  disabled={page >= pages}
                  onClick={() => setParam({ page: String(page + 1) })}
                >
                  {t('common.next')}
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </AdminShell>
  );
}

export default function ProductsPage() {
  return (
    <AuthGate realm="ADMIN">
      <Suspense>
        <ProductsTable />
      </Suspense>
    </AuthGate>
  );
}
