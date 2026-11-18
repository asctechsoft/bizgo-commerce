'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, Button, EmptyState, Skeleton } from '@bizgo/ui-web';
import type { OrderStatus } from '@bizgo/contracts';
import { browserApi } from '@/lib/api';
import { formatDateTime, formatVnd, newIdempotencyKey } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { ApiErrorBox } from './ApiErrorBox';

const CANCELLABLE: OrderStatus[] = ['PENDING_CONFIRMATION', 'CONFIRMED', 'ON_HOLD'];

function useStatusLabels() {
  const t = useTranslations('orders');
  return {
    status: (s: string) => (t.has(`statusLabels.${s}`) ? t(`statusLabels.${s}`) : s),
    payment: (s: string) => (t.has(`paymentLabels.${s}`) ? t(`paymentLabels.${s}`) : s),
  };
}

export function OrdersList() {
  const t = useTranslations('orders');
  const label = useStatusLabels();
  const orders = useLoad(() => browserApi().orders.list({ limit: 50 }));
  if (orders.loading) return <Skeleton className="mt-6 h-40 w-full" />;
  if (orders.error) return <ApiErrorBox error={orders.error} next="/tai-khoan/don-hang" />;
  const items = orders.data?.items ?? [];
  if (items.length === 0) return <EmptyState title={t('empty')} />;
  return (
    <ul className="m-0 mt-4 grid list-none gap-3 p-0">
      {items.map((o) => (
        <li key={o.id} className="rounded-card border border-line bg-white p-4 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[15px]">{o.orderNumber}</strong>
            <span className="flex gap-2">
              {o.isTest ? <Badge tone="orange">{t('testOrder')}</Badge> : null}
              <Badge tone="green">{label.status(o.status)}</Badge>
            </span>
          </div>
          <p className="m-0 mt-1 text-muted">
            {formatDateTime(o.createdAt)} · {label.payment(o.paymentStatus)}
          </p>
          <p className="m-0 mt-1 font-extrabold text-orange-deep">{formatVnd(o.totalVnd)}</p>
          <Link
            href={`/tai-khoan/don-hang/${o.id}`}
            className="mt-2 inline-block font-bold text-green underline"
          >
            {t('details')}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function OrderDetailView({ id }: { id: string }) {
  const t = useTranslations('orders');
  const label = useStatusLabels();
  const order = useLoad(() => browserApi().orders.get(id));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [cancelled, setCancelled] = useState(false);
  const key = useRef<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    key.current ??= newIdempotencyKey();
    try {
      await browserApi().orders.cancel(id, key.current);
      key.current = null;
      setCancelled(true);
      setConfirming(false);
      order.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (order.loading && !order.data) return <Skeleton className="mt-6 h-64 w-full" />;
  if (order.error) return <ApiErrorBox error={order.error} next={`/tai-khoan/don-hang/${id}`} />;
  const o = order.data!;
  const a = o.shipAddress;
  return (
    <div className="mt-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-xl font-extrabold">{o.orderNumber}</h2>
        {o.isTest ? <Badge tone="orange">{t('testOrder')}</Badge> : null}
        <Badge tone="green">{label.status(o.status)}</Badge>
        <Badge>{label.payment(o.paymentStatus)}</Badge>
      </div>
      <p className="mt-1 text-muted">{formatDateTime(o.createdAt)}</p>

      <h3 className="mb-2 mt-5 text-[14px] font-bold">{t('items')}</h3>
      <ul className="m-0 list-none p-0">
        {o.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2 border-b border-line py-2">
            <span>
              {i.name} ({i.packLabel}) × {i.quantity}
            </span>
            <span>{formatVnd(i.lineTotalVnd)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-right font-extrabold text-orange-deep">
        {t('total')}: {formatVnd(o.totalVnd)}
      </p>

      <h3 className="mb-1 mt-5 text-[14px] font-bold">{t('shipTo')}</h3>
      <p className="m-0">
        {a.receiverName} · {a.phone}
        <br />
        {[a.detail, a.ward, a.district, a.province].filter(Boolean).join(', ')}
      </p>

      <h3 className="mb-1 mt-5 text-[14px] font-bold">{t('timeline')}</h3>
      <ol className="m-0 pl-5">
        {o.timeline.map((e, i) => (
          <li key={i}>
            {label.status(e.to)} — {formatDateTime(e.at)}
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="mt-5">
        {cancelled ? (
          <p role="status" className="font-semibold text-green">
            {t('cancelled')}
          </p>
        ) : null}
        {error ? <ApiErrorBox error={error} /> : null}
        {CANCELLABLE.includes(o.status) && !cancelled ? (
          confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{t('cancelConfirm')}</span>
              <Button variant="orange" loading={busy} onClick={cancel}>
                {t('cancel')}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                ✕
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              {t('cancel')}
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

export function OrderSuccess({ id }: { id: string }) {
  const t = useTranslations('orders');
  const order = useLoad(() => browserApi().orders.get(id));
  if (order.loading) return <Skeleton className="mt-6 h-32 w-full" />;
  if (order.error) return <ApiErrorBox error={order.error} next="/tai-khoan/don-hang" />;
  const o = order.data!;
  return (
    <div
      role="status"
      className="mx-auto mt-8 max-w-lg rounded-card border border-line bg-green-soft p-6 text-center"
    >
      <div aria-hidden="true" className="text-4xl">
        ✅
      </div>
      <h2 className="mb-2 mt-2 text-xl font-extrabold">{t('successTitle')}</h2>
      <p className="m-0 text-[13px]">{t('successText', { number: o.orderNumber })}</p>
      <Link
        href={`/tai-khoan/don-hang/${o.id}`}
        className="mt-4 inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white"
      >
        {t('viewOrders')}
      </Link>
    </div>
  );
}
