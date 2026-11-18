'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminProduct } from '@bizgo/contracts';
import { Badge, Button, ErrorState, Skeleton } from '@bizgo/ui-web';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';
import { VariantsPanel } from '@/components/VariantsPanel';
import { errorKey } from '@/lib/api';

function Detail() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const { api } = useBackoffice();
  const [p, setP] = useState<AdminProduct | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    setErr(null);
    api.admin
      .product(id)
      .then((r) => alive && setP(r))
      .catch((e) => alive && setErr(t(errorKey(e).key)));
    return () => {
      alive = false;
    };
  }, [api, id, n, t]);

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid gap-1 border-t border-line py-3 sm:grid-cols-[220px_1fr]">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="m-0 text-[14px]">{value}</dd>
    </div>
  );

  return (
    <AdminShell>
      <Link href="/admin/catalog/products" className="text-[13px] font-semibold text-green">
        {t('products.back')}
      </Link>
      {err ? (
        <div className="mt-4">
          <ErrorState
            title={t('errors.title')}
            description={err}
            action={<Button onClick={() => setN((x) => x + 1)}>{t('common.retry')}</Button>}
          />
        </div>
      ) : !p ? (
        <Skeleton className="mt-4 h-64" />
      ) : (
        <>
          <h1 className="mb-1 mt-3 text-2xl font-extrabold">{p.sourceName}</h1>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone={p.status === 'ACTIVE' ? 'green' : 'neutral'}>
              {t(`status.${p.status}`)}
            </Badge>
            <Badge>{t(`origin.${p.originType}`)}</Badge>
          </div>
          <section
            aria-labelledby="src"
            className="rounded-card border border-line bg-white p-4 sm:p-5"
          >
            <h2 id="src" className="m-0 text-[15px] font-bold">
              {t('products.sourceBlock')}
            </h2>
            <dl className="m-0">
              {row(t('products.sourceName'), p.sourceName)}
              {row(t('products.sourceUnit'), p.sourceUnitText)}
              {row(
                t('products.sourceNote'),
                <code className="break-all">{p.sourceNoteRaw || '—'}</code>,
              )}
              {row(t('products.displayNote'), p.displayNote || '—')}
              {row(t('products.category'), p.category.displayName)}
              {row(t('products.aliases'), p.aliases.join(' · ') || '—')}
            </dl>
          </section>
          <section
            aria-labelledby="gate"
            className="mt-4 rounded-card border border-[#f3d4b6] bg-[#fff4e5] p-4 sm:p-5"
          >
            <h2 id="gate" className="m-0 text-[15px] font-bold">
              {t('products.gateTitle')}
            </h2>
            <p className="mb-0 mt-1 text-[13px]">{t('products.gateText')}</p>
          </section>
          <VariantsPanel productId={p.id} />
        </>
      )}
    </AdminShell>
  );
}

export default function ProductDetailPage() {
  return (
    <AuthGate realm="ADMIN">
      <Detail />
    </AuthGate>
  );
}
