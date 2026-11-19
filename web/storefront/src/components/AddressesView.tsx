'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, Loader } from '@bizgo/ui-web';
import { browserApi } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { AddressForm } from './AddressForm';
import { ApiErrorBox } from './ApiErrorBox';

export function AddressesView() {
  const t = useTranslations('address');
  const list = useLoad(() => browserApi().addresses.list());
  const [error, setError] = useState<unknown>(null);

  async function remove(id: string) {
    setError(null);
    try {
      await browserApi().addresses.remove(id);
      list.reload();
    } catch (e) {
      setError(e);
    }
  }

  if (list.loading && !list.data) return <Loader />;
  if (list.error) return <ApiErrorBox error={list.error} next="/tai-khoan/dia-chi" />;
  const items = list.data ?? [];
  return (
    <div className="mt-4 grid gap-6 md:grid-cols-2">
      <div>
        {error ? <ApiErrorBox error={error} /> : null}
        {items.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {items.map((a) => (
              <li key={a.id} className="rounded-card border border-line bg-white p-3 text-[13px]">
                <strong>{a.receiverName}</strong> · {a.phone}
                {a.isDefault ? <span className="ml-2 text-green">({t('isDefault')})</span> : null}
                <br />
                {a.detail}, {a.ward}, {a.district}, {a.province}
                <div className="mt-2">
                  <Button variant="ghost" onClick={() => remove(a.id)}>
                    {t('delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <AddressForm onCreated={() => list.reload()} />
    </div>
  );
}
