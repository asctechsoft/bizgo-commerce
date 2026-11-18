'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState, Skeleton } from '@bizgo/ui-web';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';
import { errorKey } from '@/lib/api';

function Dashboard() {
  const t = useTranslations();
  const { api, session } = useBackoffice();
  const [stats, setStats] = useState<{ draft: number; active: number; categories: number } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [draft, active, cats] = await Promise.all([
          api.admin.products({ status: 'DRAFT', limit: 1 }),
          api.admin.products({ status: 'ACTIVE', limit: 1 }),
          api.admin.categories(),
        ]);
        if (alive) setStats({ draft: draft.total, active: active.total, categories: cats.length });
      } catch (e) {
        if (alive) setErr(t(errorKey(e).key));
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, t]);

  return (
    <AdminShell>
      <h1 className="m-0 text-2xl font-extrabold">{t('dashboard.title')}</h1>
      <p className="mt-1 font-semibold">
        {t('dashboard.welcome', { name: session.user.displayName })}
      </p>
      <p className="m-0 text-[13px] text-muted">
        {t('dashboard.roles', { roles: session.user.roles.join(', ') })}
      </p>
      <p
        role="note"
        className="mt-4 max-w-2xl rounded-card border border-[#f3d4b6] bg-[#fff4e5] p-4 text-[13px]"
      >
        {t('dashboard.phaseNote')}
      </p>
      {err ? (
        <div className="mt-6">
          <ErrorState title={t('errors.title')} description={err} />
        </div>
      ) : (
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ['draftProducts', stats?.draft],
            ['activeProducts', stats?.active],
            ['categories', stats?.categories],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-card border border-line bg-white p-4">
              <dt className="text-[13px] text-muted">{t(`dashboard.${k}`)}</dt>
              <dd className="m-0 mt-1 text-3xl font-extrabold text-green">
                {v === undefined ? <Skeleton className="h-9 w-16" /> : v}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </AdminShell>
  );
}

export default function AdminPage() {
  return (
    <AuthGate realm="ADMIN">
      <Dashboard />
    </AuthGate>
  );
}
