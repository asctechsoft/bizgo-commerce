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
import { CART_CHANGED } from './HeaderTools';

/**
 * Price + variant chips + quantity stepper + add-to-cart. Price/stock are only DISPLAYED here;
 * the API re-validates everything on add, quote and order.
 */
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
  const step = variant.quantityStep;
  const clamp = (n: number) =>
    Math.min(
      variant.maxQty ?? 100_000,
      Math.max(variant.minQty, Number.isFinite(n) ? n : variant.minQty),
    );

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
      window.dispatchEvent(new Event(CART_CHANGED));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="my-5 text-[27px] font-extrabold text-green">
        {formatVnd(variant.unitPriceVnd) ?? t('priceUnavailable')}{' '}
        {variant.unitPriceVnd !== null ? (
          <small className="text-[11px] font-bold text-[#87998a]">
            / {variant.packLabel} · {variant.isTest ? t('demoPrice') : t('unitPriceNote')}
          </small>
        ) : null}
      </div>

      <div className="my-[15px] rounded-[12px] border border-line p-3.5">
        <b id="variant-h" className="text-[13px]">
          {t('chooseVariant')}
        </b>
        <div role="radiogroup" aria-labelledby="variant-h" className="mt-1">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={v.id === variant.id}
              onClick={() => pick(v.id)}
              className={`mr-1.5 mt-[7px] min-h-[40px] rounded-lg border px-[11px] text-[12px] ${v.id === variant.id ? 'border-[#75ba87] bg-green-mint text-green' : 'border-line bg-white'}`}
            >
              {v.packLabel}
              {!v.inStock ? ` · ${t('outOfStock')}` : ''}
            </button>
          ))}
        </div>
        <p className="mb-0 mt-3 text-[12px] leading-[1.8] text-muted">{t('variantNote')}</p>
      </div>

      <div className="my-[19px] flex flex-wrap items-center gap-[11px]">
        <span className="text-[13px]">{t('quantity')}:</span>
        <span className="inline-flex items-center overflow-hidden rounded-[9px] border border-line">
          <button
            type="button"
            aria-label={t('decrease')}
            className="min-h-[40px] min-w-[44px] bg-[#f6f9f5] text-[16px]"
            onClick={() => setQty(clamp(qty - step))}
          >
            −
          </button>
          <input
            aria-label={t('quantity')}
            type="number"
            inputMode="numeric"
            min={variant.minQty}
            {...(variant.maxQty !== null ? { max: variant.maxQty } : {})}
            step={step}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            onBlur={() => setQty(clamp(qty))}
            className="h-[40px] w-16 border-0 text-center text-[14px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label={t('increase')}
            className="min-h-[40px] min-w-[44px] bg-[#f6f9f5] text-[16px]"
            onClick={() => setQty(clamp(qty + step))}
          >
            +
          </button>
        </span>
      </div>

      <div className="my-[19px] flex flex-wrap items-center gap-[11px]">
        <Button
          onClick={add}
          loading={busy}
          disabled={!canBuy}
          className="rounded-[11px] px-[18px] py-3 text-[12px]"
        >
          🛒 {t('addToCart')}
        </Button>
        <Link
          href="/mua-si"
          className="inline-flex min-h-tap items-center rounded-[11px] border border-green bg-white px-[18px] text-[12px] font-bold text-green hover:bg-green-mint"
        >
          {t('wholesaleQuote')}
        </Link>
      </div>

      <div aria-live="polite">
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
                {t('loginLink')}
              </Link>
            </p>
          ) : (
            <ApiErrorBox error={error} />
          )
        ) : null}
      </div>
    </div>
  );
}
