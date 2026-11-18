'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminOrderAction, AdminOrderDetail } from '@bizgo/contracts';
import { Badge, Button, Skeleton } from '@bizgo/ui-web';
import { ActionError } from '@/components/ActionError';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';
import { newKey } from '@/lib/api';

const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const ACTIONS: { action: AdminOrderAction; from: string[] }[] = [
  { action: 'confirm', from: ['PENDING_CONFIRMATION'] },
  { action: 'hold', from: ['PENDING_CONFIRMATION', 'CONFIRMED'] },
  { action: 'resume', from: ['ON_HOLD'] },
  {
    action: 'cancel',
    from: [
      'PENDING_CONFIRMATION',
      'CONFIRMED',
      'ON_HOLD',
      'PACKING',
      'READY_TO_SHIP',
      'CANCEL_REQUESTED',
    ],
  },
];

function Detail() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const { api } = useBackoffice();
  const [o, setO] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState<AdminOrderAction | null>(null);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState('');
  const key = useRef<{ action: AdminOrderAction; key: string } | null>(null);
  const lastAction = useRef<AdminOrderAction | null>(null);

  const load = useCallback(() => {
    api.admin.orders
      .get(id)
      .then((r) => {
        setO(r);
        setError(null);
      })
      .catch(setError);
  }, [api, id]);
  useEffect(load, [load]);

  async function act(action: AdminOrderAction) {
    lastAction.current = action;
    setBusy(action);
    setActionError(null);
    setDone(false);
    // same key only while retrying the same action; a definitive answer clears it
    if (key.current?.action !== action) key.current = { action, key: newKey() };
    try {
      await api.admin.orders.act(id, action, key.current.key, reason.trim() || undefined);
      key.current = null;
      setDone(true);
      setReason('');
      load();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  }

  const a = (o?.shipAddress ?? {}) as Record<string, string | undefined>;
  return (
    <AdminShell>
      <Link href="/admin/orders" className="text-[13px] font-semibold text-green">
        {t('orders.back')}
      </Link>
      {error ? (
        <ActionError error={error} onRetry={load} />
      ) : !o ? (
        <Skeleton className="mt-4 h-64" />
      ) : (
        <div className="mt-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-2xl font-extrabold">{o.orderNumber}</h1>
            {o.isTest ? <Badge tone="orange">{t('orders.test')}</Badge> : null}
            <Badge tone="green">{t(`orders.statusLabels.${o.status}`)}</Badge>
            <Badge>
              {o.paymentMethod} · {o.paymentStatus}
            </Badge>
          </div>

          <section className="mt-4 rounded-card border border-line bg-white p-4">
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
            <p className="mb-0 mt-2 text-right font-extrabold">
              {t('orders.total')}: {vnd.format(o.totalVnd)}
              {o.shippingNote === 'MANUAL_QUOTE' ? ` · ${t('orders.shippingManual')}` : ''}
            </p>
          </section>

          <section className="mt-4 rounded-card border border-line bg-white p-4">
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

          {o.financial ? (
            <section className="mt-4 rounded-card border border-line bg-white p-4">
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

          <section className="mt-4 rounded-card border border-line bg-white p-4">
            <h2 className="m-0 text-[15px] font-bold">{t('orders.timeline')}</h2>
            <ol className="mb-0 mt-1 pl-5">
              {o.timeline.map((e, i) => (
                <li key={i}>
                  {t(`orders.statusLabels.${e.to}`)} — {new Date(e.at).toLocaleString('vi-VN')}
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-4" aria-live="polite">
            <label htmlFor="reason" className="mb-1 block font-semibold">
              {t('orders.reason')}
            </label>
            <input
              id="reason"
              value={reason}
              maxLength={100}
              pattern="[A-Za-z0-9_ .:\-]+"
              onChange={(e) => setReason(e.target.value)}
              className="min-h-tap w-full rounded-control border border-line px-3 text-[14px] sm:w-80"
            />
            {actionError ? (
              <ActionError
                error={actionError}
                onRetry={() => lastAction.current && void act(lastAction.current)}
              />
            ) : null}
            {done ? (
              <p role="status" className="font-semibold text-green">
                {t('orders.done')}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {ACTIONS.filter((x) => x.from.includes(o.status)).map((x) => (
                <Button
                  key={x.action}
                  variant={x.action === 'cancel' ? 'secondary' : 'primary'}
                  loading={busy === x.action}
                  disabled={busy !== null}
                  onClick={() => void act(x.action)}
                >
                  {t(`orders.${x.action}`)}
                </Button>
              ))}
            </div>
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
