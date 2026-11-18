'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminOrderAction, AdminOrderDetail, OrderStatus } from '@bizgo/contracts';
import { Badge, Button, Field, Skeleton, TextInput } from '@bizgo/ui-web';
import { ActionError } from '@/components/ActionError';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';
import { newKey } from '@/lib/api';
import { useLive } from '@/lib/use-live';

const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const dt = (iso: string) => new Date(iso).toLocaleString('vi-VN');

/** Which staff buttons make sense per status. The server stays the authority (transition table). */
const FLOW: { action: AdminOrderAction; from: OrderStatus[]; primary?: boolean }[] = [
  { action: 'confirm', from: ['PENDING_CONFIRMATION'], primary: true },
  { action: 'pack', from: ['CONFIRMED'], primary: true },
  { action: 'ready', from: ['PACKING'], primary: true },
  { action: 'deliver', from: ['SHIPPED'], primary: true },
  { action: 'complete', from: ['DELIVERED'], primary: true },
  { action: 'resume', from: ['ON_HOLD'], primary: true },
  { action: 'reject-cancel', from: ['CANCEL_REQUESTED'] },
  { action: 'hold', from: ['PENDING_CONFIRMATION', 'CONFIRMED'] },
];
const CANCELLABLE: OrderStatus[] = [
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'ON_HOLD',
  'PACKING',
  'READY_TO_SHIP',
  'CANCEL_REQUESTED',
];

function Detail() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const { api } = useBackoffice();
  const [o, setO] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState(false);
  const [cancelReason, setCancelReason] = useState('OUT_OF_STOCK');
  const key = useRef<{ id: string; key: string } | null>(null);
  const retry = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    try {
      setO(await api.admin.orders.get(id));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api, id]);
  useEffect(() => {
    void load();
  }, [load]);
  const live = useLive(() => {
    void load();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 2500);
  });

  /** One idempotency key per logical action; kept only while the same action is retried. */
  const run = useCallback(
    async (name: string, fn: (k: string) => Promise<unknown>) => {
      const attempt = async () => {
        setBusy(name);
        setActionError(null);
        setDone(false);
        if (key.current?.id !== name) key.current = { id: name, key: newKey() };
        try {
          await fn(key.current.key);
          key.current = null;
          setDone(true);
          await load();
        } catch (e) {
          setActionError(e);
        } finally {
          setBusy(null);
        }
      };
      retry.current = attempt;
      await attempt();
    },
    [load],
  );

  function ship(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const carrier = String(f.get('carrier') ?? '').trim();
    const trackingCode = String(f.get('trackingCode') ?? '').trim();
    void run('ship', (k) => api.admin.orders.act(id, 'ship', k, { carrier, trackingCode }));
  }
  function fee(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = String(new FormData(e.currentTarget).get('fee') ?? '').trim();
    if (!/^\d+$/.test(raw)) {
      setActionError(new Error('invalid'));
      return;
    }
    void run('fee', () => api.admin.orders.setShippingFee(id, Number(raw)));
  }

  const a = (o?.shipAddress ?? {}) as Record<string, string | undefined>;
  const st = o?.status;
  const canFee = st === 'PENDING_CONFIRMATION' || st === 'CONFIRMED' || st === 'ON_HOLD';
  const canCod =
    !!o &&
    o.paymentMethod === 'COD' &&
    (st === 'DELIVERED' || st === 'COMPLETED') &&
    o.payment.status === 'PENDING';
  const box = 'mt-4 rounded-card border border-line bg-white p-4';

  return (
    <AdminShell>
      <Link href="/admin/orders" className="text-[13px] font-semibold text-green">
        {t('orders.back')}
      </Link>
      {error ? (
        <ActionError error={error} onRetry={() => void load()} />
      ) : !o ? (
        <Skeleton className="mt-4 h-64" />
      ) : (
        <div className="mt-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-2xl font-extrabold">{o.orderNumber}</h1>
            {o.isTest ? <Badge tone="orange">{t('orders.test')}</Badge> : null}
            <Badge tone="green">{t(`orders.statusLabels.${o.status}`)}</Badge>
            <Badge>
              {o.paymentMethod} · {o.payment.status}
            </Badge>
            <span
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted"
              role="status"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-green' : 'bg-[#b9c4bd]'}`}
              />
              {live ? t('orders.live') : t('orders.liveOff')}
            </span>
          </div>
          <div aria-live="polite" className="min-h-[20px]">
            {flash ? <p className="m-0 font-semibold text-green">{t('orders.updated')}</p> : null}
          </div>

          {o.status === 'CANCEL_REQUESTED' ? (
            <p role="note" className="mt-2 rounded-control bg-[#fff4e5] p-3 font-semibold">
              {t('orders.cancelRequestedNote')}
            </p>
          ) : null}

          <section className={box}>
            <h2 className="m-0 text-[15px] font-bold">{t('orders.items')}</h2>
            <ul className="m-0 list-none p-0">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 border-b border-line py-2">
                  <span>
                    {i.sku} · {i.name} ({i.packLabel}) × {i.quantity}
                  </span>
                  <span>{vnd.format(i.lineTotalVnd)}</span>
                </li>
              ))}
            </ul>
            <p className="mb-0 mt-2 text-right">
              {t('orders.subtotal')}: {vnd.format(o.subtotalVnd)} · {t('orders.shippingFeeTitle')}:{' '}
              {o.shippingNote === 'MANUAL_QUOTE'
                ? t('orders.shippingManual')
                : vnd.format(o.shippingFeeVnd ?? 0)}
            </p>
            <p className="mb-0 mt-1 text-right text-[15px] font-extrabold">
              {t('orders.total')}: {vnd.format(o.totalVnd)}
            </p>
          </section>

          <section className={box}>
            <h2 className="m-0 text-[15px] font-bold">{t('orders.contact')}</h2>
            <p className="mb-0 mt-1">
              {o.contact?.name ?? '—'} · {o.contact?.phone ?? '—'}
            </p>
            <h2 className="mb-0 mt-3 text-[15px] font-bold">{t('orders.shipTo')}</h2>
            <p className="mb-0 mt-1">
              {[a.detail, a.ward, a.district, a.province].filter(Boolean).join(', ') || '—'}
            </p>
            {!a.detail ? <p className="mb-0 mt-1 text-muted">{t('orders.piiMasked')}</p> : null}
          </section>

          {o.shipment ? (
            <section className={box}>
              <h2 className="m-0 text-[15px] font-bold">{t('orders.shipment')}</h2>
              <p className="mb-0 mt-1">
                {o.shipment.carrier} · <b>{o.shipment.trackingCode}</b> · {dt(o.shipment.shippedAt)}
                {o.shipment.deliveredAt ? ` → ${dt(o.shipment.deliveredAt)}` : ''}
              </p>
            </section>
          ) : null}

          {o.financial ? (
            <section className={box}>
              <h2 className="m-0 text-[15px] font-bold">{t('orders.financial')}</h2>
              <dl className="mb-0 mt-1 grid grid-cols-[1fr_auto] gap-y-1">
                <dt>{t('orders.revenue')}</dt>
                <dd className="m-0">{vnd.format(o.financial.revenueNetVnd)}</dd>
                <dt>{t('orders.cost')}</dt>
                <dd className="m-0">
                  {o.financial.costSnapshotVnd === null
                    ? t('orders.unknown')
                    : vnd.format(o.financial.costSnapshotVnd)}
                </dd>
                <dt>{t('orders.margin')}</dt>
                <dd className="m-0">
                  {o.financial.expectedMarginVnd === null
                    ? t('orders.unknown')
                    : vnd.format(o.financial.expectedMarginVnd)}
                </dd>
              </dl>
            </section>
          ) : null}

          <section className={box}>
            <h2 className="m-0 text-[15px] font-bold">{t('orders.timeline')}</h2>
            <ol className="mb-0 mt-1 pl-5">
              {o.timeline.map((e, i) => (
                <li key={i}>
                  {t(`orders.statusLabels.${e.to}`)} — {dt(e.at)} ({e.by})
                  {e.reasonCode ? ` · ${e.reasonCode}` : ''}
                </li>
              ))}
            </ol>
          </section>

          <section className={box} aria-live="polite">
            {actionError ? (
              <ActionError error={actionError} onRetry={() => void retry.current?.()} />
            ) : null}
            {done ? (
              <p role="status" className="m-0 mb-2 font-semibold text-green">
                {t('orders.done')}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {FLOW.filter((x) => x.from.includes(o.status)).map((x) => (
                <Button
                  key={x.action}
                  variant={x.primary ? 'primary' : 'secondary'}
                  loading={busy === x.action}
                  disabled={busy !== null}
                  onClick={() => void run(x.action, (k) => api.admin.orders.act(id, x.action, k))}
                >
                  {t(`orders.${x.action}`)}
                </Button>
              ))}
              {canCod ? (
                <Button
                  loading={busy === 'cod'}
                  disabled={busy !== null}
                  onClick={() => void run('cod', () => api.admin.orders.collectCod(id))}
                >
                  {t('orders.collectCod')}
                </Button>
              ) : null}
            </div>

            {o.status === 'READY_TO_SHIP' ? (
              <form
                onSubmit={ship}
                noValidate
                className="mt-4 max-w-md rounded-control border border-line p-3"
              >
                <b>{t('orders.ship')}</b>
                <Field id="carrier" label={t('orders.carrier')}>
                  {(f) => <TextInput {...f} name="carrier" maxLength={80} required />}
                </Field>
                <Field id="trackingCode" label={t('orders.trackingCode')}>
                  {(f) => <TextInput {...f} name="trackingCode" maxLength={80} required />}
                </Field>
                <p className="mt-0 text-[12px] text-muted">{t('orders.shipNote')}</p>
                <Button type="submit" loading={busy === 'ship'} disabled={busy !== null}>
                  {t('orders.ship')}
                </Button>
              </form>
            ) : null}

            {canFee ? (
              <form
                onSubmit={fee}
                noValidate
                className="mt-4 max-w-md rounded-control border border-line p-3"
              >
                <b>{t('orders.shippingFeeTitle')}</b>
                <Field id="fee" label={t('orders.shippingFeeLabel')}>
                  {(f) => <TextInput {...f} name="fee" inputMode="numeric" maxLength={9} />}
                </Field>
                <Button
                  type="submit"
                  variant="ghost"
                  loading={busy === 'fee'}
                  disabled={busy !== null}
                >
                  {t('orders.shippingFeeSave')}
                </Button>
              </form>
            ) : null}

            {CANCELLABLE.includes(o.status) ? (
              <div className="mt-4 flex max-w-md flex-wrap items-end gap-2 rounded-control border border-line p-3">
                <div className="min-w-[200px] flex-1">
                  <label htmlFor="cancel-reason" className="mb-1.5 block font-semibold">
                    {t('orders.cancelReasonLabel')}
                  </label>
                  <select
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="min-h-tap w-full rounded-control border border-line bg-white px-2"
                  >
                    {['OUT_OF_STOCK', 'CUSTOMER_UNREACHABLE', 'DELIVERY_UNSUPPORTED', 'OTHER'].map(
                      (r) => (
                        <option key={r} value={r}>
                          {t(`orders.cancelReasons.${r}`)}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <Button
                  variant="secondary"
                  loading={busy === 'cancel'}
                  disabled={busy !== null}
                  onClick={() =>
                    void run('cancel', (k) =>
                      api.admin.orders.act(id, 'cancel', k, { reason: cancelReason }),
                    )
                  }
                >
                  {t('orders.cancel')}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

export default function OrderDetailPage() {
  return (
    <AuthGate realm="ADMIN">
      <Detail />
    </AuthGate>
  );
}
