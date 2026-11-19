'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminInquiry, InquiryKind, InquiryStatus } from '@bizgo/contracts';
import { Badge, EmptyState, Loader } from '@bizgo/ui-web';
import { ActionError } from '@/components/ActionError';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';

const KINDS: InquiryKind[] = ['QUOTE', 'CONTACT', 'NEWSLETTER'];
const STATUSES: InquiryStatus[] = ['NEW', 'IN_PROGRESS', 'DONE', 'SPAM'];
const dt = (iso: string) => new Date(iso).toLocaleString('vi-VN');

function Inbox() {
  const t = useTranslations('inquiries');
  const { api } = useBackoffice();
  const [kind, setKind] = useState<InquiryKind | ''>('');
  const [status, setStatus] = useState<InquiryStatus | ''>('');
  const [rows, setRows] = useState<AdminInquiry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.admin.inquiries.list({
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        limit: 50,
      });
      setRows(r.items);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api, kind, status]);
  useEffect(() => {
    void load();
  }, [load]);

  async function change(id: string, next: InquiryStatus) {
    setActionError(null);
    try {
      await api.admin.inquiries.setStatus(id, next);
      await load();
    } catch (e) {
      setActionError(e);
    }
  }

  const chip = (active: boolean) =>
    `min-h-[40px] rounded-full border px-4 text-[12px] font-semibold ${active ? 'border-green bg-green text-white' : 'border-line bg-white'}`;

  return (
    <AdminShell>
      <h1 className="m-0 text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-0 mt-1 text-[13px] text-muted">{t('hint')}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('kind')}>
        {(['', ...KINDS] as const).map((k) => (
          <button
            key={k || 'all'}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={chip(kind === k)}
          >
            {k ? t(`kinds.${k}`) : t('all')}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('status')}>
        {(['', ...STATUSES] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={chip(status === s)}
          >
            {s ? t(`statuses.${s}`) : t('all')}
          </button>
        ))}
      </div>

      {error ? <ActionError error={error} onRetry={() => void load()} /> : null}
      {actionError ? <ActionError error={actionError} /> : null}
      {!rows && !error ? <Loader variant="section" /> : null}
      {rows && rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={t('empty')} />
        </div>
      ) : null}

      <ul className="m-0 mt-4 grid list-none gap-3 p-0">
        {rows?.map((r) => (
          <li key={r.id} className="rounded-card border border-line bg-white p-4 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b>
                {t(`kinds.${r.kind}`)} · {r.fullName ?? r.email}
              </b>
              <span className="flex items-center gap-2">
                <Badge
                  tone={r.status === 'NEW' ? 'orange' : r.status === 'DONE' ? 'green' : 'neutral'}
                >
                  {t(`statuses.${r.status}`)}
                </Badge>
                <select
                  aria-label={t('status')}
                  value={r.status}
                  onChange={(e) => void change(r.id, e.target.value as InquiryStatus)}
                  className="min-h-[36px] rounded-control border border-line bg-white px-2 text-[12px]"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <p className="m-0 mt-1 text-[11px] text-muted">
              {dt(r.createdAt)}
              {r.phone ? ` · ${r.phone}` : ''}
              {r.email && r.fullName ? ` · ${r.email}` : ''}
              {r.province ? ` · ${r.province}` : ''}
              {r.businessType ? ` · ${t(`business.${r.businessType}`)}` : ''}
              {r.topic ? ` · ${t(`topics.${r.topic}`)}` : ''}
            </p>
            {r.message ? <p className="m-0 mt-2 whitespace-pre-line">{r.message}</p> : null}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}

export default function InquiriesPage() {
  return (
    <AuthGate realm="ADMIN">
      <Inbox />
    </AuthGate>
  );
}
