'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Loader } from '@bizgo/ui-web';
import type { OrderDetail, SupportRequest, SupportType } from '@bizgo/contracts';
import { browserApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useLive } from '@/lib/use-live';
import { ApiErrorBox } from './ApiErrorBox';

const TYPES: SupportType[] = ['WRONG_ITEM', 'MISSING_ITEM', 'DAMAGED', 'RETURN_EXCHANGE', 'OTHER'];
const TONE: Record<string, string> = {
  OPEN: 'bg-[#fff1e6] text-orange-deep',
  IN_PROGRESS: 'bg-[#e6f4ee] text-[#0f6b4a]',
  RESOLVED: 'bg-[#e8f6ec] text-green',
  CLOSED: 'bg-green-soft text-muted',
};

export function SupportView({ id }: { id: string }) {
  const t = useTranslations('support');
  const to = useTranslations('orders');
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [list, setList] = useState<SupportRequest[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [type, setType] = useState<SupportType>('MISSING_ITEM');
  const [picked, setPicked] = useState<string[]>([]);
  const [desc, setDesc] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const api = browserApi();
      const [o, s] = await Promise.all([api.orders.get(id), api.orders.support.list(id)]);
      setOrder(o);
      setList(s);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useLive('customer', () => void load());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (desc.trim().length < 5) {
      setFormError(t('required'));
      return;
    }
    setFormError(null);
    setBusy(true);
    setActionError(null);
    try {
      await browserApi().orders.support.create(id, {
        type,
        ...(picked.length ? { orderItemIds: picked } : {}),
        description: desc.trim(),
      });
      setDesc('');
      setPicked([]);
      setSent(true);
      await load();
    } catch (e2) {
      setActionError(e2);
    } finally {
      setBusy(false);
    }
  }

  if (error && !order)
    return <ApiErrorBox error={error} next={`/tai-khoan/don-hang/${id}/ho-tro`} />;
  if (!order) return <Loader />;
  const card = 'rounded-[14px] border border-line bg-white p-4';

  return (
    <div className="text-[13px]">
      <Link href={`/tai-khoan/don-hang/${id}`} className="text-[12px] font-semibold text-green">
        ← {t('backToOrder')} {order.orderNumber}
      </Link>
      <h2 className="mb-1 mt-2 text-[22px] font-extrabold">{t('title')}</h2>
      <p className="m-0 text-[12px] text-muted">{t('subtitle')}</p>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[1fr_340px]">
        <form onSubmit={submit} noValidate className={card}>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 font-bold">{t('step1')}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TYPES.map((k) => (
                <label
                  key={k}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[10px] border px-2 text-[12px] ${type === k ? 'border-green bg-green-mint font-bold' : 'border-line'}`}
                >
                  <input
                    type="radio"
                    name="type"
                    checked={type === k}
                    onChange={() => setType(k)}
                  />
                  {t(`types.${k}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="m-0 mt-4 border-0 p-0">
            <legend className="mb-2 font-bold">{t('step2')}</legend>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {order.items.map((i) => (
                <li key={i.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[10px] border border-line px-2">
                    <input
                      type="checkbox"
                      checked={picked.includes(i.id)}
                      onChange={(e) =>
                        setPicked((p) =>
                          e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id),
                        )
                      }
                    />
                    <span className="flex-1">
                      {i.name} ({i.packLabel})
                    </span>
                    <span className="text-muted">× {i.quantity}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="sup-desc" className="mb-1.5 block font-bold">
              {t('step3')}
            </label>
            <textarea
              id="sup-desc"
              value={desc}
              maxLength={500}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t('descPlaceholder')}
              aria-invalid={!!formError}
              className="min-h-[110px] w-full rounded-[10px] border border-line p-3 text-[14px]"
            />
            <div className="flex justify-between gap-3 text-[11px] text-muted">
              <span>{t('evidenceNote')}</span>
              <span className="shrink-0">{t('chars', { n: desc.length })}</span>
            </div>
            {formError ? (
              <p role="alert" className="m-0 mt-1 text-[12px] font-semibold text-danger">
                {formError}
              </p>
            ) : null}
          </div>
          {actionError ? <ApiErrorBox error={actionError} /> : null}
          {sent ? (
            <p role="status" className="mb-0 mt-2 font-semibold text-green">
              {t('sent')}
            </p>
          ) : null}
          <div className="mt-3">
            <Button type="submit" loading={busy}>
              ✈ {t('send')}
            </Button>
          </div>
        </form>

        <section className={card} aria-labelledby="sup-hist">
          <b id="sup-hist">{t('historyTitle')}</b>
          {list.length === 0 ? <p className="mb-0 mt-2 text-muted">{t('noRequests')}</p> : null}
          <ul className="m-0 mt-2 grid list-none gap-3 p-0">
            {list.map((r) => (
              <li key={r.id}>
                <Thread request={r} onChanged={load} />
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="mt-3 text-[11px] text-muted">{to('codNote')}</p>
    </div>
  );
}

function Thread({
  request,
  onChanged,
}: {
  request: SupportRequest;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('support');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function reply(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await browserApi().orders.support.reply(request.id, body.trim());
      setBody('');
      await onChanged();
    } catch (e2) {
      setError(e2);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-[12px] border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <b>{t(`types.${request.type}`)}</b>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE[request.status]}`}
        >
          {t(`statusLabels.${request.status}`)}
        </span>
      </div>
      <p className="m-0 mt-1 text-[11px] text-muted">{formatDateTime(request.createdAt)}</p>
      {request.orderItems.length ? (
        <p className="m-0 mt-1 text-[12px]">{request.orderItems.map((i) => i.name).join(', ')}</p>
      ) : null}
      <div className="mt-2 grid gap-1.5">
        <p className="m-0 rounded-[10px] bg-green-soft p-2">
          <b>{t('you')}:</b> {request.description}
        </p>
        {request.messages.map((m) => (
          <p
            key={m.id}
            className={`m-0 rounded-[10px] p-2 ${m.from === 'STAFF' ? 'bg-green-mint' : 'bg-green-soft'}`}
          >
            <b>{m.from === 'STAFF' ? t('staff') : t('you')}:</b> {m.body}
            <span className="ml-2 text-[10px] text-muted">{formatDateTime(m.at)}</span>
          </p>
        ))}
      </div>
      {request.status === 'CLOSED' ? (
        <p className="mb-0 mt-2 text-[11px] text-muted">{t('closedNote')}</p>
      ) : (
        <form onSubmit={reply} className="mt-2 flex gap-2">
          <label className="sr-only" htmlFor={`rp-${request.id}`}>
            {t('replyLabel')}
          </label>
          <input
            id={`rp-${request.id}`}
            value={body}
            maxLength={1000}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('replyLabel')}
            className="min-h-[40px] min-w-0 flex-1 rounded-[9px] border border-line px-2.5"
          />
          <Button type="submit" loading={busy}>
            {t('replySend')}
          </Button>
        </form>
      )}
      {error ? <ApiErrorBox error={error} /> : null}
    </div>
  );
}
