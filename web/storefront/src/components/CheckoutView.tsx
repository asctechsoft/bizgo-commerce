'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, NetworkError, type Address, type CheckoutQuote } from '@bizgo/contracts';
import { Button, EmptyState, Skeleton } from '@bizgo/ui-web';
import { browserApi } from '@/lib/api';
import { formatVnd, newIdempotencyKey } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { AddressForm } from './AddressForm';
import { ApiErrorBox } from './ApiErrorBox';

export function CheckoutView() {
  const t = useTranslations('checkout');
  const router = useRouter();
  const addresses = useLoad(() => browserApi().addresses.list());
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState<unknown>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<unknown>(null);
  const [stale, setStale] = useState(false);
  // One key per user attempt: reused on network retry, regenerated once the quote changes or a definitive answer arrives.
  const idemKey = useRef<string | null>(null);

  useEffect(() => {
    if (addressId || !addresses.data?.length) return;
    setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0])!.id);
  }, [addresses.data, addressId]);

  const refreshQuote = useCallback(async (id: string) => {
    setQuoting(true);
    setQuoteError(null);
    try {
      setQuote(await browserApi().checkout.quote({ addressId: id }));
      idemKey.current = null;
    } catch (e) {
      setQuote(null);
      setQuoteError(e);
    } finally {
      setQuoting(false);
    }
  }, []);

  useEffect(() => {
    if (addressId) void refreshQuote(addressId);
  }, [addressId, refreshQuote]);

  async function place() {
    if (!quote || !addressId) return;
    setPlacing(true);
    setPlaceError(null);
    setStale(false);
    idemKey.current ??= newIdempotencyKey();
    try {
      const order = await browserApi().checkout.placeOrder(
        {
          checkoutQuoteId: quote.quoteId,
          acceptedQuoteVersion: quote.version,
          paymentMethod: 'COD',
        },
        idemKey.current,
      );
      // Success is shown ONLY because the API answered 2xx with a persisted order.
      router.push(`/dat-hang-thanh-cong?order=${encodeURIComponent(order.id)}`);
    } catch (e) {
      if (e instanceof NetworkError) {
        // outcome unknown: keep the same key so a retry cannot create a second order
      } else {
        idemKey.current = null;
        if (e instanceof ApiError && ['PRICE_CHANGED', 'QUOTE_EXPIRED'].includes(e.code)) {
          setStale(true);
          void refreshQuote(addressId);
        }
      }
      setPlaceError(e);
      setPlacing(false);
    }
  }

  if (addresses.loading) return <Skeleton className="mt-6 h-48 w-full" />;
  if (addresses.error) return <ApiErrorBox error={addresses.error} next="/thanh-toan" />;
  const list: Address[] = addresses.data ?? [];

  return (
    <div className="mt-4 grid gap-6 md:grid-cols-[1fr_380px]">
      <section aria-labelledby="addr-h">
        <h2 id="addr-h" className="mt-0 text-lg font-bold">
          {t('address')}
        </h2>
        {list.length === 0 && !adding ? (
          <EmptyState
            title={t('noAddress')}
            action={<Button onClick={() => setAdding(true)}>{t('addAddress')}</Button>}
          />
        ) : null}
        <div role="radiogroup" aria-labelledby="addr-h" className="grid gap-2">
          {list.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer gap-3 rounded-card border p-3 text-[13px] ${a.id === addressId ? 'border-green bg-green-mint' : 'border-line bg-white'}`}
            >
              <input
                type="radio"
                name="address"
                checked={a.id === addressId}
                onChange={() => setAddressId(a.id)}
              />
              <span>
                <strong>{a.receiverName}</strong> · {a.phone}
                <br />
                {a.detail}, {a.ward}, {a.district}, {a.province}
              </span>
            </label>
          ))}
        </div>
        {list.length > 0 && !adding ? (
          <Button variant="secondary" className="mt-3" onClick={() => setAdding(true)}>
            {t('addAddress')}
          </Button>
        ) : null}
        {adding ? (
          <div className="mt-3">
            <AddressForm
              onCreated={(a) => {
                addresses.setData([...list, a]);
                setAddressId(a.id);
                setAdding(false);
              }}
            />
          </div>
        ) : null}
      </section>

      <aside aria-labelledby="sum-h" className="h-fit rounded-card border border-line bg-white p-4">
        <h2 id="sum-h" className="mt-0 text-lg font-bold">
          {t('summary')}
        </h2>
        <div aria-live="polite">
          {stale ? (
            <p role="alert" className="text-[13px] font-semibold text-danger">
              {t('priceChanged')}
            </p>
          ) : null}
          {quoting ? <p className="text-[13px] text-muted">{t('quoteLoading')}</p> : null}
          {quoteError ? <ApiErrorBox error={quoteError} next="/thanh-toan" /> : null}
          {!addressId && !quoting ? (
            <p className="text-[13px] text-muted">{t('noAddress')}</p>
          ) : null}
        </div>
        {quote ? (
          <>
            {quote.lines.length === 0 ? (
              <p className="text-[13px]">
                {t('emptyCart')}{' '}
                <Link href="/danh-muc" className="font-bold text-green underline">
                  →
                </Link>
              </p>
            ) : null}
            <ul className="m-0 list-none p-0 text-[13px]">
              {quote.lines.map((l) => (
                <li
                  key={l.variantId}
                  className="flex justify-between gap-2 border-b border-line py-2"
                >
                  <span>
                    {l.name} ({l.packLabel}) × {l.quantity}
                  </span>
                  <span>{formatVnd(l.lineTotalVnd) ?? '—'}</span>
                </li>
              ))}
            </ul>
            <dl className="mb-0 mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
              <dt>{t('subtotal')}</dt>
              <dd className="m-0 text-right">
                {formatVnd(quote.subtotalVnd) ?? t('totalUndetermined')}
              </dd>
              <dt>{t('shipping')}</dt>
              <dd className="m-0 text-right">
                {quote.shippingNote === 'MANUAL_QUOTE'
                  ? t('shippingManual')
                  : (formatVnd(quote.shippingFeeVnd) ?? t('totalUndetermined'))}
              </dd>
              <dt className="font-extrabold">{t('total')}</dt>
              <dd className="m-0 text-right font-extrabold text-orange-deep">
                {formatVnd(quote.totalVnd) ?? t('totalUndetermined')}
              </dd>
            </dl>
            {quote.blockers.length > 0 ? (
              <div role="alert" className="mt-3 rounded-control bg-[#fdf2f1] p-3 text-[13px]">
                <strong>{t('blocked')}</strong>
                <ul className="mb-0 mt-1 pl-5">
                  {quote.blockers.map((b, i) => (
                    <li key={`${b.code}-${i}`}>{b.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <h3 className="mb-1 mt-4 text-[14px] font-bold">{t('payment')}</h3>
            <p className="m-0 text-[13px] font-semibold">{t('cod')}</p>
            <p className="mt-1 text-xs text-muted">{t('codNote')}</p>
            {placeError ? (
              <div className="mt-3">
                <ApiErrorBox error={placeError} next="/thanh-toan" />
              </div>
            ) : null}
            <Button
              variant="orange"
              className="mt-4 w-full"
              loading={placing}
              disabled={!quote.canPlaceOrder || quote.lines.length === 0}
              onClick={place}
            >
              {placing ? t('placing') : t('place')}
            </Button>
          </>
        ) : null}
      </aside>
    </div>
  );
}
