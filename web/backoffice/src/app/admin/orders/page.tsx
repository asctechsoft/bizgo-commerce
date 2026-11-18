'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminOrderSummary, Page } from '@bizgo/contracts';
import { Badge, Button, EmptyState, Skeleton } from '@bizgo/ui-web';
import { ActionError } from '@/components/ActionError';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';
import { useLive } from '@/lib/use-live';

const LIMIT = 20;
const STATUSES = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'ON_HOLD',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'PACKING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
] as const;

const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function List() {
  const t = useTranslations();
  const { api } = useBackoffice();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminOrderSummary> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [n, setN] = useState(0);
  useLive(() => setN((x) => x + 1));

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api.admin.orders
      .list({ ...(status ? { status } : {}), page, limit: LIMIT })
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [api, status, page, n]);

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  return (
    <AdminShell>
      <h1 className="m-0 text-2xl font-extrabold">{t('orders.title')}</h1>
      <div className="mt-4">
        <label htmlFor="o-status" className="mb-1 block text-[13px] font-semibold">
          {t('orders.colStatus')}
        </label>
        <select
          id="o-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="min-h-tap w-full rounded-control border border-line bg-white px-3 text-[14px] sm:w-64"
        >
          <option value="">{t('common.all')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`orders.statusLabels.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-5" aria-live="polite">
        {error ? (
          <>
            <ActionError error={error} onRetry={() => setN((x) => x + 1)} />
            <Button onClick={() => setN((x) => x + 1)}>{t('common.retry')}</Button>
          </>
        ) : !data ? (
          <Skeleton className="h-48" />
        ) : data.items.length === 0 ? (
          <EmptyState title={t('orders.empty')} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-card border border-line bg-white">
              <table className="w-full min-w-[680px] border-collapse text-left text-[13px]">
                <caption className="sr-only">{t('orders.title')}</caption>
                <thead className="bg-green-soft text-muted">
                  <tr>
                    {['colNumber', 'colDate', 'colStatus', 'colPayment', 'colTotal'].map((c) => (
                      <th key={c} scope="col" className="px-3 py-2.5">
                        {t(`orders.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((o) => (
                    <tr key={o.id} className="border-t border-line">
                      <td className="px-3 py-2.5 font-semibold">
                        <Link href={`/admin/orders/${o.id}`} className="text-green hover:underline">
                          {o.orderNumber}
                        </Link>{' '}
                        {o.isTest ? <Badge tone="orange">{t('orders.test')}</Badge> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        {new Date(o.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone="green">{t(`orders.statusLabels.${o.status}`)}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {o.paymentMethod} · {o.paymentStatus}
                      </td>
                      <td className="px-3 py-2.5">{vnd.format(o.totalVnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <nav className="mt-4 flex items-center justify-center gap-3" aria-label="pagination">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  {t('common.previous')}
                </Button>
                <span className="text-[13px] text-muted">{t('common.page', { page, pages })}</span>
                <Button
                  variant="secondary"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
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

export default function OrdersPage() {
  return (
    <AuthGate realm="ADMIN">
      <List />
    </AuthGate>
  );
}
