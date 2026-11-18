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
import { CART_CHANGED } from './HeaderTools';

const TH = 'border-b border-line p-3.5';
const TD = 'border-b border-line p-3.5';
const SUM_ROW =
  'flex justify-between gap-5 border-b border-line py-[11px] text-[12px] text-[#657568]';

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
      window.dispatchEvent(new Event(CART_CHANGED));
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
      <div className="mt-5">
        <EmptyState
          title={t('empty')}
          description={t('emptyText')}
          action={
            <Link href="/danh-muc" className="font-bold text-green underline">
              {t('continue')}
            </Link>
          }
        />
      </div>
    );
  }
  const canCheckout = items.every((i) => i.available);
  const priced = items.every((i) => i.unitPriceVnd !== null);
  const goods = priced
    ? items.reduce((sum, i) => sum + (i.unitPriceVnd ?? 0) * i.quantity, 0)
    : null;

  return (
    <div className="mt-5">
      {actionError ? <ApiErrorBox error={actionError} next="/gio-hang" /> : null}
      <div className="grid items-start gap-[25px] md:grid-cols-[minmax(0,1fr)_330px]">
        <div className="overflow-x-auto rounded-[17px] border border-line bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[#f9fbf8] text-[11px] text-[#708078]">
                <th scope="col" className={TH}>
                  {t('colProduct')}
                </th>
                <th scope="col" className={TH}>
                  {t('colPrice')}
                </th>
                <th scope="col" className={TH}>
                  {t('colQty')}
                </th>
                <th scope="col" className={TH}>
                  {t('colTotal')}
                </th>
                <th scope="col" className={TH}>
                  <span className="sr-only">{t('remove')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="text-[12px]">
                  <td className={TD}>
                    <b>{i.name}</b>
                    <div className="text-[10px] text-muted">{i.packLabel}</div>
                    {!i.available ? (
                      <div role="alert" className="text-[11px] font-semibold text-danger">
                        {t('unavailable')}
                      </div>
                    ) : null}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {formatVnd(i.unitPriceVnd) ?? t('priceNotSet')}
                  </td>
                  <td className={TD}>
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
                      className="min-h-[40px] w-20 rounded-[9px] border border-line px-3 text-[14px]"
                    />
                  </td>
                  <td className={`${TD} whitespace-nowrap font-bold`}>
                    {i.unitPriceVnd === null ? '—' : formatVnd(i.unitPriceVnd * i.quantity)}
                  </td>
                  <td className={TD}>
                    <Button
                      variant="secondary"
                      loading={busyId === i.id}
                      onClick={() => run(i.id, () => browserApi().cart.remove(i.id))}
                    >
                      {t('remove')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside
          aria-labelledby="cart-sum"
          className="rounded-[17px] border border-line bg-white p-5"
        >
          <h3 id="cart-sum" className="mt-0 text-[14px]">
            {t('summary')}
          </h3>
          <div className={SUM_ROW}>
            <span>{t('goodsEstimate')}</span>
            <b className="text-ink">{formatVnd(goods) ?? t('undetermined')}</b>
          </div>
          <div className={SUM_ROW}>
            <span>{t('shippingLine')}</span>
            <b className="text-ink">{t('shippingNotCalc')}</b>
          </div>
          <div className="flex justify-between gap-5 py-[11px] text-[17px] font-extrabold">
            <span>{t('estimateTotal')}</span>
            <span>{formatVnd(goods) ?? t('undetermined')}</span>
          </div>
          <p className="text-[12px] leading-[1.9] text-muted">{t('estimateNote')}</p>
          <Link
            href="/thanh-toan"
            aria-disabled={!canCheckout}
            className={`flex min-h-tap items-center justify-center rounded-control bg-green px-4 text-[12px] font-bold text-white hover:bg-green-deep ${canCheckout ? '' : 'pointer-events-none opacity-60'}`}
          >
            {t('checkout')} →
          </Link>
          <p className="mb-0 mt-3">
            <Link href="/danh-muc" className="text-[12px] font-semibold text-green">
              ← {t('continue')}
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
