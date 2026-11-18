'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, Skeleton } from '@bizgo/ui-web';
import type { Cart } from '@bizgo/contracts';
import { browserApi } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { ApiErrorBox } from './ApiErrorBox';

export function CartView() {
  const t = useTranslations('cart');
  const cart = useLoad(() => browserApi().cart.get());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  async function run(id: string, fn: () => Promise<Cart>) {
    setBusyId(id);
    setActionError(null);
    try {
      cart.setData(await fn());
    } catch (e) {
      setActionError(e);
    } finally {
      setBusyId(null);
    }
  }

  if (cart.loading) return <Skeleton className="mt-6 h-48 w-full" />;
  if (cart.error) return <ApiErrorBox error={cart.error} next="/gio-hang" />;
  const items = cart.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('empty')}
        description={t('emptyText')}
        action={
          <Link href="/danh-muc" className="font-bold text-green underline">
            {t('continue')}
          </Link>
        }
      />
    );
  }
  const canCheckout = items.every((i) => i.available);
  return (
    <div>
      {actionError ? <ApiErrorBox error={actionError} next="/gio-hang" /> : null}
      <ul className="m-0 mt-4 grid list-none gap-3 p-0">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="m-0 font-bold">{i.name}</p>
              <p className="m-0 text-[13px] text-muted">{i.packLabel}</p>
              {!i.available ? (
                <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
                  {t('unavailable')}
                </p>
              ) : null}
              <p className="m-0 mt-1 font-extrabold text-orange-deep">
                {formatVnd(i.unitPriceVnd) ?? t('priceNotSet')}
              </p>
            </div>
            <input
              type="number"
              min={1}
              defaultValue={i.quantity}
              aria-label={`${t('qty')} ${i.name}`}
              disabled={busyId === i.id}
              onBlur={(e) => {
                const q = Number(e.target.value);
                if (q !== i.quantity && q > 0)
                  void run(i.id, () => browserApi().cart.setQuantity(i.id, q));
              }}
              className="min-h-tap w-24 rounded-control border border-line px-3 py-2 text-[14px]"
            />
            <Button
              variant="ghost"
              loading={busyId === i.id}
              onClick={() => run(i.id, () => browserApi().cart.remove(i.id))}
            >
              {t('remove')}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">{t('estimateNote')}</p>
      <Link
        href="/thanh-toan"
        aria-disabled={!canCheckout}
        className={`mt-4 inline-flex min-h-tap items-center rounded-control bg-orange-deep px-6 text-[13px] font-bold text-white ${canCheckout ? '' : 'pointer-events-none opacity-60'}`}
      >
        {t('checkout')}
      </Link>
    </div>
  );
}
