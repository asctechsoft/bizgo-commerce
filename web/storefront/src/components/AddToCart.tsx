'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@bizgo/ui-web';
import type { PublicVariant } from '@bizgo/contracts';
import { browserApi } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { isUnauthenticated } from '@/lib/errors';
import { ApiErrorBox } from './ApiErrorBox';

/** Only variants with a backend-provided price are purchasable; price/stock are re-validated by the API. */
export function AddToCart({ variants, slug }: { variants: PublicVariant[]; slug: string }) {
  const t = useTranslations('product');
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const [qty, setQty] = useState(variant?.minQty ?? 1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!variant) return null;
  const canBuy = variant.inStock && variant.unitPriceVnd !== null;

  function pick(id: string) {
    const v = variants.find((x) => x.id === id);
    setVariantId(id);
    setQty(v?.minQty ?? 1);
    setDone(false);
  }

  async function add() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await browserApi().cart.add(variant!.id, qty);
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="variant-h" className="mt-5">
      <h2 id="variant-h" className="m-0 text-[14px] font-bold">
        {t('chooseVariant')}
      </h2>
      <div role="radiogroup" aria-labelledby="variant-h" className="mt-2 grid gap-2">
        {variants.map((v) => (
          <label
            key={v.id}
            className={`flex min-h-tap cursor-pointer items-center justify-between gap-3 rounded-control border px-3 py-2 text-[13px] ${v.id === variant.id ? 'border-green bg-green-mint' : 'border-line bg-white'}`}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="variant"
                checked={v.id === variant.id}
                onChange={() => pick(v.id)}
              />
              <span className="font-semibold">{v.packLabel}</span>
              {!v.inStock ? <span className="text-danger">{t('outOfStock')}</span> : null}
            </span>
            <span className="font-extrabold text-orange-deep">
              {formatVnd(v.unitPriceVnd) ?? t('priceUnavailable')}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div>
          <label htmlFor={`qty-${slug}`} className="mb-1.5 block text-[13px] font-semibold">
            {t('quantity')}
          </label>
          <input
            id={`qty-${slug}`}
            type="number"
            inputMode="numeric"
            min={variant.minQty}
            {...(variant.maxQty !== null ? { max: variant.maxQty } : {})}
            step={variant.quantityStep}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="min-h-tap w-28 rounded-control border border-line px-3 py-2 text-[14px]"
          />
        </div>
        <Button onClick={add} loading={busy} disabled={!canBuy} variant="orange">
          {t('addToCart')}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">{t('pricesEstimate')}</p>
      <div aria-live="polite" className="mt-3">
        {done ? (
          <p role="status" className="text-[13px] font-semibold text-green">
            {t('added')}{' '}
            <Link href="/gio-hang" className="underline">
              {t('viewCart')}
            </Link>
          </p>
        ) : null}
        {error ? (
          isUnauthenticated(error) ? (
            <p role="alert" className="text-[13px]">
              {t('loginToBuy')}{' '}
              <Link
                href={`/dang-nhap?next=${encodeURIComponent(`/san-pham/${slug}`)}`}
                className="font-bold text-green underline"
              >
                OK
              </Link>
            </p>
          ) : (
            <ApiErrorBox error={error} />
          )
        ) : null}
      </div>
    </section>
  );
}
