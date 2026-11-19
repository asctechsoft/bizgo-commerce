'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, Loader } from '@bizgo/ui-web';
import type { OrderDetail, OrderGroup, OrderListItem, OrderSummaryCounts } from '@bizgo/contracts';
import { browserApi } from '@/lib/api';
import { formatDateTime, formatVnd, newIdempotencyKey } from '@/lib/format';
import { buildSteps, type Step } from '@/lib/order-flow';
import { useLive } from '@/lib/use-live';
import { useLoad } from '@/lib/use-load';
import { ApiErrorBox } from './ApiErrorBox';
import { CART_CHANGED } from './HeaderTools';

const GROUP_TONE: Record<OrderGroup, string> = {
  pending: 'bg-[#fff1e6] text-orange-deep',
  confirmed: 'bg-[#e8f6ec] text-green',
  preparing: 'bg-[#fff4e0] text-[#a8660b]',
  shipping: 'bg-[#e6f4ee] text-[#0f6b4a]',
  delivered: 'bg-[#e8f6ec] text-green',
  cancelled: 'bg-[#fdecea] text-danger',
  other: 'bg-green-soft text-muted',
};
const GROUPS: OrderGroup[] = [
  'pending',
  'confirmed',
  'preparing',
  'shipping',
  'delivered',
  'cancelled',
];

function useLabels() {
  const t = useTranslations('orders');
  return {
    status: (s: string) => (t.has(`statusLabels.${s}`) ? t(`statusLabels.${s}`) : s),
    payment: (method: string, s: string) =>
      method === 'COD' && s === 'PENDING'
        ? t('paymentMethod.COD')
        : t.has(`paymentLabels.${s}`)
          ? t(`paymentLabels.${s}`)
          : s,
  };
}

function Chip({ group, children }: { group: OrderGroup; children: React.ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold ${GROUP_TONE[group]}`}
    >
      {children}
    </span>
  );
}

function Thumb({ src, name }: { src: string | null; name: string }) {
  return (
    <span className="relative inline-grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-green-soft">
      {src ? (
        <Image src={src} alt={name} fill sizes="52px" className="object-contain p-1" />
      ) : (
        <span aria-hidden="true">🛒</span>
      )}
    </span>
  );
}

function LiveBadge({ live }: { live: boolean }) {
  const t = useTranslations('orders');
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted" role="status">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-green' : 'bg-[#b9c4bd]'}`}
      />
      {live ? t('liveOn') : t('liveOff')}
    </span>
  );
}

/** Reorder shared by list + detail: adds lines to the cart and reports what was skipped. */
function useReorder() {
  const t = useTranslations('orders');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [error, setError] = useState<unknown>(null);
  async function run(id: string) {
    setBusy(id);
    setError(null);
    setNote(null);
    try {
      const r = await browserApi().orders.reorder(id, newIdempotencyKey());
      window.dispatchEvent(new Event(CART_CHANGED));
      setNote({
        ok: r.skipped.length === 0,
        text:
          t('reorderDone', { n: r.added }) +
          (r.skipped.length
            ? ` ${t('reorderSkipped', { names: r.skipped.map((s) => s.name).join(', ') })}`
            : ''),
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }
  return { run, busy, note, error };
}

// ───────────────────────────── list ─────────────────────────────

const PAGE = 10;

export function OrdersList() {
  const t = useTranslations('orders');
  const label = useLabels();
  const reorder = useReorder();
  const [group, setGroup] = useState<OrderGroup | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [pages, setPages] = useState(1);
  const [data, setData] = useState<{ items: OrderListItem[]; total: number } | null>(null);
  const [counts, setCounts] = useState<OrderSummaryCounts | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState(false);

  const load = useCallback(async () => {
    try {
      const api = browserApi();
      const [list, sum] = await Promise.all([
        api.orders.list({ ...(group === 'all' ? {} : { group }), sort, limit: PAGE * pages }),
        api.orders.summary(),
      ]);
      setData({ items: list.items, total: list.total });
      setCounts(sum);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [group, sort, pages]);

  useEffect(() => {
    void load();
  }, [load]);
  const live = useLive('customer', () => {
    void load();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 2500);
  });

  if (error && !data) return <ApiErrorBox error={error} next="/tai-khoan/don-hang" />;
  if (!data || !counts) return <Loader />;

  const tiles: { g: OrderGroup | 'all'; n: number }[] = [
    { g: 'all', n: counts.all },
    ...GROUPS.filter((g) => g !== 'pending' || true).map((g) => ({ g, n: counts[g] })),
  ];

  return (
    <div>
      <div className="relative overflow-hidden rounded-[16px] bg-gradient-to-r from-[#e7f5e8] to-[#f6fbf3] px-6 py-5">
        <h2 className="m-0 text-[22px] font-extrabold">{t('bannerTitle')}</h2>
        <p className="m-0 mt-1 text-[13px] text-muted">{t('bannerText')}</p>
        <Image
          src="/hero/hero2.jpg"
          alt=""
          width={420}
          height={120}
          className="pointer-events-none absolute right-0 top-0 hidden h-full w-[45%] object-cover opacity-60 [mask-image:linear-gradient(90deg,transparent,#000_40%)] md:block"
        />
      </div>

      <section
        aria-label={t('overview')}
        className="mt-3 rounded-[14px] border border-line bg-white p-3"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <b className="text-[14px]">{t('overview')}</b>
            <span className="ml-2 text-[11px] text-muted">{t('overviewSub')}</span>
          </div>
          <LiveBadge live={live} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {tiles.map(({ g, n }) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setGroup(g);
                setPages(1);
              }}
              aria-pressed={group === g}
              className={`rounded-[12px] border px-3 py-2 text-left ${group === g ? 'border-green bg-green-mint' : 'border-line bg-white hover:bg-green-soft'}`}
            >
              <span className="block text-[11px] text-muted">{t(`groups.${g}`)}</span>
              <b className="text-[16px]">{t('count', { n })}</b>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={t('overview')} className="flex flex-wrap gap-2">
          {(['all', ...GROUPS] as const).map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={group === g}
              type="button"
              onClick={() => {
                setGroup(g);
                setPages(1);
              }}
              className={`min-h-[40px] rounded-full border px-4 text-[12px] font-semibold ${group === g ? 'border-green bg-green text-white' : 'border-line bg-white text-ink hover:bg-green-mint'}`}
            >
              {t(`groups.${g}`)} ({g === 'all' ? counts.all : counts[g]})
            </button>
          ))}
        </div>
        <label className="text-[12px]">
          <span className="sr-only">{t('sortLabel')}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
            className="min-h-[40px] rounded-[9px] border border-line bg-white px-2.5 text-[13px]"
          >
            <option value="newest">{t('sortNewest')}</option>
            <option value="oldest">{t('sortOldest')}</option>
          </select>
        </label>
      </div>

      <div aria-live="polite" className="mt-2 min-h-[20px]">
        {flash ? (
          <p className="m-0 text-[12px] font-semibold text-green">{t('liveUpdated')}</p>
        ) : null}
        {reorder.note ? (
          <p
            className={`m-0 text-[12px] font-semibold ${reorder.note.ok ? 'text-green' : 'text-orange-deep'}`}
          >
            {reorder.note.text}{' '}
            <Link href="/gio-hang" className="underline">
              {t('goCart')}
            </Link>
          </p>
        ) : null}
        {reorder.error ? <ApiErrorBox error={reorder.error} /> : null}
      </div>

      {data.items.length === 0 ? (
        <EmptyState title={group === 'all' ? t('empty') : t('emptyGroup')} />
      ) : (
        <ul className="m-0 mt-2 grid list-none gap-3 p-0">
          {data.items.map((o) => (
            <li key={o.id} className="rounded-[14px] border border-line bg-white p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link
                    href={`/tai-khoan/don-hang/${o.id}`}
                    className="text-[15px] font-extrabold hover:text-green"
                  >
                    {t('orderCode')} {o.orderNumber}
                  </Link>
                  <p className="m-0 text-[11px] text-muted">
                    {t('dateLabel')}: {formatDateTime(o.createdAt)}
                    {o.isTest ? ` · ${t('testOrder')}` : ''}
                  </p>
                </div>
                <Chip group={o.group}>{label.status(o.status)}</Chip>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex gap-1.5">
                  {o.preview.map((p, i) => (
                    <Thumb key={i} src={p.imageUrl} name={p.name} />
                  ))}
                </div>
                <div className="min-w-[160px] flex-1 text-[12px]">
                  {o.preview.map((p, i) => (
                    <div key={i} className="truncate">
                      {p.name} ({p.packLabel}) × {p.quantity}
                    </div>
                  ))}
                  {o.moreItems > 0 ? (
                    <div className="font-semibold text-green">
                      {t('moreItems', { n: o.moreItems })}
                    </div>
                  ) : null}
                </div>
                <div className="text-[12px]">
                  <div className="text-muted">{t('total')}</div>
                  <b className="text-[15px] text-orange-deep">{formatVnd(o.totalVnd)}</b>
                </div>
                <div className="text-[12px]">
                  <div className="text-muted">{t('paymentLabel')}</div>
                  <b>{label.payment(o.paymentMethod, o.paymentStatus)}</b>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/tai-khoan/don-hang/${o.id}`}
                  className="inline-flex min-h-[40px] items-center rounded-[10px] bg-green px-4 text-[12px] font-bold text-white hover:bg-green-deep"
                >
                  {t('viewDetails')} →
                </Link>
                <Button
                  variant="secondary"
                  loading={reorder.busy === o.id}
                  onClick={() => reorder.run(o.id)}
                >
                  🛒 {t('buyAgain')}
                </Button>
                <Link
                  href={`/tai-khoan/don-hang/${o.id}/ho-tro`}
                  className="inline-flex min-h-[40px] items-center rounded-[10px] border border-green px-4 text-[12px] font-bold text-green hover:bg-green-mint"
                >
                  {t('contactSupport')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.items.length < data.total ? (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => setPages((p) => p + 1)}>
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────── detail ─────────────────────────────

function Stepper({ steps }: { steps: Step[] }) {
  const t = useTranslations('orders');
  return (
    <ol className="m-0 flex list-none gap-0 overflow-x-auto p-0" aria-label={t('history')}>
      {steps.map((s, i) => (
        <li
          key={s.key}
          className="relative min-w-[96px] flex-1 text-center"
          aria-current={s.state === 'current' ? 'step' : undefined}
        >
          {i > 0 ? (
            <span
              aria-hidden="true"
              className={`absolute left-[-50%] top-[15px] h-[3px] w-full ${s.state === 'todo' ? 'bg-line' : s.state === 'failed' ? 'bg-danger' : 'bg-green'}`}
            />
          ) : null}
          <span
            className={`relative z-10 mx-auto grid h-[32px] w-[32px] place-items-center rounded-full border-2 text-[14px] font-bold ${
              s.state === 'done'
                ? 'border-green bg-green text-white'
                : s.state === 'current'
                  ? 'border-green bg-white text-green ring-4 ring-green-mint'
                  : s.state === 'failed'
                    ? 'border-danger bg-danger text-white'
                    : 'border-line bg-white text-[#b9c4bd]'
            }`}
          >
            {s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : i + 1}
          </span>
          <b
            className={`mt-1.5 block text-[12px] ${s.state === 'todo' ? 'text-muted' : s.state === 'failed' ? 'text-danger' : 'text-ink'}`}
          >
            {s.hint ? t(`stepHints.${s.hint}`) : t(`steps.${s.key}`)}
          </b>
          <span className="block text-[10px] text-muted">{s.at ? formatDateTime(s.at) : ' '}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyButton({ text }: { text: string }) {
  const t = useTranslations('orders');
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="ml-2 rounded-md border border-line px-2 py-0.5 text-[11px] text-green hover:bg-green-mint"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          window.setTimeout(() => setOk(false), 1500);
        } catch {
          /* clipboard unavailable: ignore */
        }
      }}
    >
      {ok ? t('copied') : t('copy')}
    </button>
  );
}

export function OrderDetailView({ id }: { id: string }) {
  const t = useTranslations('orders');
  const label = useLabels();
  const reorder = useReorder();
  const [o, setO] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('CUSTOMER_REQUEST');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const key = useRef<string | null>(null);
  const prevStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await browserApi().orders.get(id);
      setO(d);
      setError(null);
      if (prevStatus.current && prevStatus.current !== d.status) {
        setFlash(true);
        window.setTimeout(() => setFlash(false), 4000);
      }
      prevStatus.current = d.status;
    } catch (e) {
      setError(e);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const live = useLive('customer', () => void load());

  async function cancel() {
    setBusy(true);
    setActionError(null);
    key.current ??= newIdempotencyKey();
    try {
      await browserApi().orders.cancel(id, key.current, reason);
      key.current = null;
      setCancelOpen(false);
      await load();
    } catch (e) {
      setActionError(e);
      key.current = null;
    } finally {
      setBusy(false);
    }
  }

  if (error && !o) return <ApiErrorBox error={error} next={`/tai-khoan/don-hang/${id}`} />;
  if (!o) return <Loader />;

  const a = o.shipAddress;
  const steps = buildSteps(o.status, o.timeline);
  const bannerKey =
    o.status === 'PENDING_CONFIRMATION'
      ? 'pending'
      : o.status === 'CONFIRMED'
        ? 'confirmed'
        : o.status === 'PACKING' || o.status === 'READY_TO_SHIP'
          ? 'preparing'
          : o.status === 'SHIPPED' || o.status === 'PARTIALLY_SHIPPED'
            ? 'shipping'
            : o.status === 'DELIVERED'
              ? 'delivered'
              : o.status === 'COMPLETED'
                ? 'completed'
                : o.status === 'ON_HOLD'
                  ? 'onHold'
                  : o.status === 'CANCELLED'
                    ? 'cancelled'
                    : o.status === 'CANCEL_REQUESTED'
                      ? 'cancelRequested'
                      : 'other';
  const evAt = (s: string) => o.timeline.find((e) => e.to === s)?.at ?? null;
  const card = 'rounded-[14px] border border-line bg-white p-4';

  return (
    <div className="text-[13px]">
      <Link href="/tai-khoan/don-hang" className="text-[12px] font-semibold text-green">
        ← {t('back')}
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[22px] font-extrabold">
          {t('orderCode')} {o.orderNumber}
        </h2>
        <div className="flex items-center gap-3">
          <LiveBadge live={live} />
          <Chip group={o.group}>{label.status(o.status)}</Chip>
        </div>
      </div>
      <p className="m-0 mt-1 text-[12px] text-muted">
        {t('dateLabel')}: {formatDateTime(o.createdAt)}
        {o.isTest ? ` · ${t('testOrder')}` : ''}
      </p>

      <div aria-live="polite" className="min-h-[22px]">
        {flash ? <p className="m-0 mt-1 font-semibold text-green">{t('liveUpdated')}</p> : null}
      </div>

      <section
        aria-label={t('banners.' + bannerKey)}
        className={`mt-2 rounded-[14px] p-4 ${o.status === 'CANCELLED' ? 'bg-[#fdf2f1]' : 'bg-gradient-to-r from-[#e7f5e8] to-[#f6fbf3]'}`}
      >
        <b className="text-[15px]">{t('banners.' + bannerKey)}</b>
        {o.status === 'DELIVERED' && o.shipment?.deliveredAt ? (
          <p className="m-0 mt-1 text-muted">
            {t('deliveredAt')}: {formatDateTime(o.shipment.deliveredAt)}
          </p>
        ) : null}
        {o.status === 'PENDING_CONFIRMATION' ? (
          <p className="m-0 mt-1 text-muted">{t('codNote')}</p>
        ) : null}
        {o.status === 'CANCEL_REQUESTED' ? (
          <p className="m-0 mt-1 text-muted">{t('cancelRequestedNote')}</p>
        ) : null}
      </section>

      <div className={`${card} mt-3`}>
        <Stepper steps={steps} />
      </div>

      {o.status === 'CANCELLED' && o.cancel ? (
        <div role="note" className="mt-3 rounded-[14px] border border-[#f0c9c5] bg-[#fdf2f1] p-4">
          <b className="text-danger">{t('cancelBoxTitle')}</b>
          <p className="m-0 mt-1 font-semibold">
            {o.cancel.reasonCode && t.has(`cancelReasons.${o.cancel.reasonCode}`)
              ? t(`cancelReasons.${o.cancel.reasonCode}`)
              : t(`cancelledBy.${o.cancel.by}`)}
          </p>
          <p className="m-0 mt-1 text-muted">
            {t(`cancelledBy.${o.cancel.by}`)} ({formatDateTime(o.cancel.at)})
          </p>
          {o.payment.status === 'PENDING' || o.payment.status === 'FAILED' ? (
            <p className="m-0 mt-1 text-muted">{t('cancelNoRefund')}</p>
          ) : null}
        </div>
      ) : null}

      {o.status === 'PACKING' || o.status === 'READY_TO_SHIP' || o.status === 'CONFIRMED' ? (
        <section className={`${card} mt-3`} aria-labelledby="prep-h">
          <b id="prep-h">{t('prepTitle')}</b>
          <ul className="m-0 mt-2 list-none p-0">
            {[
              { k: 'prepConfirmed', at: evAt('CONFIRMED') },
              { k: 'prepPacking', at: evAt('PACKING') },
              { k: 'prepReady', at: evAt('READY_TO_SHIP') },
            ].map((s) => (
              <li
                key={s.k}
                className="flex items-center justify-between gap-2 border-b border-line py-1.5 last:border-0"
              >
                <span>
                  <span aria-hidden="true" className={s.at ? 'text-green' : 'text-[#b9c4bd]'}>
                    {s.at ? '●' : '○'}
                  </span>{' '}
                  {t(s.k)}
                </span>
                <span className="text-[11px] text-muted">{s.at ? formatDateTime(s.at) : '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {o.shipment ? (
        <section className={`${card} mt-3`} aria-labelledby="ship-h">
          <b id="ship-h">🚚 {t('shipTitle')}</b>
          <dl className="m-0 mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div>
              <dt className="text-muted">{t('carrier')}</dt>
              <dd className="m-0 font-semibold">{o.shipment.carrier}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('tracking')}</dt>
              <dd className="m-0 font-semibold">
                {o.shipment.trackingCode}
                <CopyButton text={o.shipment.trackingCode} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t('shippedAt')}</dt>
              <dd className="m-0">{formatDateTime(o.shipment.shippedAt)}</dd>
            </div>
            {o.shipment.deliveredAt ? (
              <div>
                <dt className="text-muted">{t('deliveredAt')}</dt>
                <dd className="m-0">{formatDateTime(o.shipment.deliveredAt)}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3">
          <section className={card} aria-labelledby="info-h">
            <b id="info-h">{t('info')}</b>
            <dl className="m-0 mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <div>
                <dt className="text-muted">{t('orderCode')}</dt>
                <dd className="m-0 font-semibold">
                  {o.orderNumber}
                  <CopyButton text={o.orderNumber} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t('orderDate')}</dt>
                <dd className="m-0">{formatDateTime(o.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('payMethod')}</dt>
                <dd className="m-0">{t(`paymentMethod.${o.payment.method}`)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('payStatus')}</dt>
                <dd className="m-0 font-semibold">{label.payment('', o.payment.status)}</dd>
              </div>
            </dl>
          </section>

          <section className={card} aria-labelledby="addr-h2">
            <b id="addr-h2">📍 {t('addressTitle')}</b>
            <p className="m-0 mt-2">
              <b>{a.receiverName}</b> · {a.phone}
              <br />
              {[a.detail, a.ward, a.district, a.province].filter(Boolean).join(', ')}
            </p>
          </section>

          <section className={card} aria-labelledby="items-h">
            <b id="items-h">
              {t('itemsTitle')} ({o.items.length})
            </b>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-green-soft text-[11px] text-muted">
                    <th scope="col" className="p-2">
                      {t('colProduct')}
                    </th>
                    <th scope="col" className="p-2">
                      {t('colQty')}
                    </th>
                    <th scope="col" className="p-2">
                      {t('colUnit')}
                    </th>
                    <th scope="col" className="p-2 text-right">
                      {t('colLine')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id} className="border-b border-line last:border-0">
                      <td className="p-2">
                        <span className="flex items-center gap-2">
                          <Thumb src={i.imageUrl} name={i.name} />
                          <span>
                            <b>{i.name}</b>
                            <span className="block text-[11px] text-muted">{i.packLabel}</span>
                          </span>
                        </span>
                      </td>
                      <td className="p-2">× {i.quantity}</td>
                      <td className="whitespace-nowrap p-2">{formatVnd(i.unitPriceVnd)}</td>
                      <td className="whitespace-nowrap p-2 text-right font-bold text-green">
                        {formatVnd(i.lineTotalVnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="grid gap-3">
          <section className={card} aria-labelledby="actions-h">
            <b id="actions-h">{t('actionsTitle')}</b>
            <div className="mt-2 grid gap-2">
              {o.actions.cancel && !cancelOpen ? (
                <Button
                  variant="secondary"
                  className="border-danger text-danger"
                  onClick={() => setCancelOpen(true)}
                >
                  ✕ {o.actions.cancel === 'CANCEL' ? t('cancel') : t('cancelRequest')}
                </Button>
              ) : null}
              {cancelOpen ? (
                <div className="rounded-[10px] border border-line p-3">
                  <label htmlFor="cancel-reason" className="mb-1.5 block font-semibold">
                    {t('cancelAsk')}
                  </label>
                  <select
                    id="cancel-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="min-h-[40px] w-full rounded-[9px] border border-line bg-white px-2"
                  >
                    {[
                      'CUSTOMER_REQUEST',
                      'CHANGED_MIND',
                      'WRONG_ADDRESS',
                      'FOUND_BETTER_PRICE',
                      'ORDERED_BY_MISTAKE',
                      'OTHER',
                    ].map((r) => (
                      <option key={r} value={r}>
                        {t(`cancelReasons.${r}`)}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex gap-2">
                    <Button variant="orange" loading={busy} onClick={cancel}>
                      {t('cancelConfirmBtn')}
                    </Button>
                    <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                      {t('cancelKeep')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {actionError ? <ApiErrorBox error={actionError} /> : null}
              {o.actions.reorder ? (
                <Button loading={reorder.busy === o.id} onClick={() => reorder.run(o.id)}>
                  🛒 {t('buyAgain')}
                </Button>
              ) : null}
              {reorder.note ? (
                <p
                  role="status"
                  className={`m-0 text-[12px] font-semibold ${reorder.note.ok ? 'text-green' : 'text-orange-deep'}`}
                >
                  {reorder.note.text}{' '}
                  <Link href="/gio-hang" className="underline">
                    {t('goCart')}
                  </Link>
                </p>
              ) : null}
              {reorder.error ? <ApiErrorBox error={reorder.error} /> : null}
              {o.actions.support ? (
                <Link
                  href={`/tai-khoan/don-hang/${o.id}/ho-tro`}
                  className="inline-flex min-h-tap items-center justify-center rounded-control border border-green px-4 text-[13px] font-bold text-green hover:bg-green-mint"
                >
                  🎧 {t('contactSupport')}
                </Link>
              ) : null}
            </div>
          </section>

          <section className={card} aria-labelledby="sum-h2">
            <b id="sum-h2">{t('grandTotal')}</b>
            <dl className="m-0 mt-2 grid grid-cols-[1fr_auto] gap-y-1.5">
              <dt className="text-muted">{t('subtotal')}</dt>
              <dd className="m-0 text-right">{formatVnd(o.subtotalVnd)}</dd>
              <dt className="text-muted">{t('shipping')}</dt>
              <dd className="m-0 text-right">
                {o.shippingNote === 'MANUAL_QUOTE'
                  ? t('shippingManual')
                  : formatVnd(o.shippingFeeVnd)}
              </dd>
              {o.discountVnd > 0 ? (
                <>
                  <dt className="text-muted">{t('discount')}</dt>
                  <dd className="m-0 text-right">-{formatVnd(o.discountVnd)}</dd>
                </>
              ) : null}
            </dl>
            <div className="mt-2 flex items-center justify-between rounded-[10px] bg-green-mint p-3">
              <b>{t('grandTotal')}</b>
              <b className="text-[18px] text-green">{formatVnd(o.totalVnd)}</b>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ───────────────────────────── success ─────────────────────────────

export function OrderSuccess({ id }: { id: string }) {
  const t = useTranslations('orders');
  const order = useLoad(() => browserApi().orders.get(id));
  if (order.loading) return <Loader />;
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
