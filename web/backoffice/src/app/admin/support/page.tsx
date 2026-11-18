'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { SupportRequest, SupportStatus } from '@bizgo/contracts';
import { Badge, Button, EmptyState, Skeleton } from '@bizgo/ui-web';
import { ActionError } from '@/components/ActionError';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';
import { useLive } from '@/lib/use-live';

const STATUSES: SupportStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const dt = (iso: string) => new Date(iso).toLocaleString('vi-VN');

function Inbox() {
  const t = useTranslations('support');
  const { api } = useBackoffice();
  const [filter, setFilter] = useState<SupportStatus | ''>('');
  const [list, setList] = useState<SupportRequest[] | null>(null);
  const [selected, setSelected] = useState<SupportRequest | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.admin.support.list({ ...(filter ? { status: filter } : {}), limit: 50 });
      setList(r.items);
      setError(null);
      setSelected((cur) => (cur ? (r.items.find((x) => x.id === cur.id) ?? cur) : cur));
    } catch (e) {
      setError(e);
    }
  }, [api, filter]);
  useEffect(() => {
    void load();
  }, [load]);
  useLive(() => void load());

  async function reply(e: FormEvent) {
    e.preventDefault();
    if (!selected || !body.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      setSelected(await api.admin.support.reply(selected.id, body.trim()));
      setBody('');
      await load();
    } catch (e2) {
      setActionError(e2);
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(status: SupportStatus) {
    if (!selected) return;
    setActionError(null);
    try {
      setSelected(await api.admin.support.setStatus(selected.id, status));
      await load();
    } catch (e) {
      setActionError(e);
    }
  }

  return (
    <AdminShell>
      <h1 className="m-0 text-2xl font-extrabold">{t('title')}</h1>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('colStatus')}>
        {(['', ...STATUSES] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={`min-h-[40px] rounded-full border px-4 text-[12px] font-semibold ${filter === s ? 'border-green bg-green text-white' : 'border-line bg-white'}`}
          >
            {s ? t(`statuses.${s}`) : t('filterAll')}
          </button>
        ))}
      </div>

      {error ? <ActionError error={error} onRetry={() => void load()} /> : null}
      {!list && !error ? <Skeleton className="mt-4 h-40" /> : null}
      {list && list.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={t('empty')} />
        </div>
      ) : null}

      {list && list.length > 0 ? (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul className="m-0 grid list-none gap-2 p-0">
            {list.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  aria-current={selected?.id === r.id}
                  className={`w-full rounded-card border p-3 text-left text-[13px] ${selected?.id === r.id ? 'border-green bg-green-mint' : 'border-line bg-white hover:bg-green-soft'}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <b>
                      {r.orderNumber} · {t(`types.${r.type}`)}
                    </b>
                    <Badge
                      tone={
                        r.status === 'OPEN'
                          ? 'orange'
                          : r.status === 'RESOLVED'
                            ? 'green'
                            : 'neutral'
                      }
                    >
                      {t(`statuses.${r.status}`)}
                    </Badge>
                  </span>
                  <span className="block text-[11px] text-muted">
                    {r.customerName} · {dt(r.updatedAt)}
                  </span>
                  <span className="mt-1 block truncate">{r.description}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <section
              className="rounded-card border border-line bg-white p-4 text-[13px]"
              aria-label={selected.orderNumber}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-[15px]">
                  {selected.orderNumber} · {t(`types.${selected.type}`)}
                </b>
                <Link
                  href={`/admin/orders/${selected.orderId}`}
                  className="font-semibold text-green underline"
                >
                  {t('openOrder')}
                </Link>
              </div>
              <p className="m-0 mt-1 text-[11px] text-muted">
                {selected.customerName} · {dt(selected.createdAt)}
              </p>
              {selected.orderItems.length ? (
                <p className="mb-0 mt-2">
                  <b>{t('items')}:</b>{' '}
                  {selected.orderItems
                    .map((i) => `${i.name} (${i.packLabel}) × ${i.quantity}`)
                    .join(', ')}
                </p>
              ) : null}
              <div className="mt-3 grid gap-1.5">
                <p className="m-0 rounded-control bg-green-soft p-2">
                  <b>{t('customer')}:</b> {selected.description}
                </p>
                {selected.messages.map((m) => (
                  <p
                    key={m.id}
                    className={`m-0 rounded-control p-2 ${m.from === 'STAFF' ? 'bg-green-mint' : 'bg-green-soft'}`}
                  >
                    <b>{m.from === 'STAFF' ? t('staff') : t('customer')}:</b> {m.body}
                    <span className="ml-2 text-[10px] text-muted">{dt(m.at)}</span>
                  </p>
                ))}
              </div>
              {actionError ? <ActionError error={actionError} /> : null}
              {selected.status !== 'CLOSED' ? (
                <form onSubmit={reply} className="mt-3 flex gap-2">
                  <label className="sr-only" htmlFor="staff-reply">
                    {t('reply')}
                  </label>
                  <input
                    id="staff-reply"
                    value={body}
                    maxLength={1000}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={t('reply')}
                    className="min-h-tap min-w-0 flex-1 rounded-control border border-line px-3"
                  />
                  <Button type="submit" loading={busy}>
                    {t('send')}
                  </Button>
                </form>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-muted">{t('setStatus')}:</span>
                {STATUSES.filter((s) => s !== selected.status).map((s) => (
                  <Button key={s} variant="ghost" onClick={() => void setStatus(s)}>
                    {t(`statuses.${s}`)}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </AdminShell>
  );
}

export default function SupportPage() {
  return (
    <AuthGate realm="ADMIN">
      <Inbox />
    </AuthGate>
  );
}
