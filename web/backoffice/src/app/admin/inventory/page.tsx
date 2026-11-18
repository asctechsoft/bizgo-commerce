'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { InventoryRow } from '@bizgo/contracts';
import { Button, EmptyState, Field, SelectInput, Skeleton, TextInput } from '@bizgo/ui-web';
import { ActionError } from '@/components/ActionError';
import { AdminShell } from '@/components/AdminShell';
import { AuthGate, useBackoffice } from '@/components/AuthGate';
import { newKey } from '@/lib/api';

function Inventory() {
  const t = useTranslations('inventory');
  const { api } = useBackoffice();
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [warehouses, setWarehouses] = useState<{ id: string; code: string; name: string }[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState<unknown>(null);
  const [whError, setWhError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const key = useRef<string | null>(null);

  const load = useCallback(() => {
    api.admin.inventory
      .list()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch(setError);
  }, [api]);
  const loadWarehouses = useCallback(() => {
    api.admin.inventory
      .warehouses()
      .then(setWarehouses)
      .catch(() => undefined);
  }, [api]);
  useEffect(load, [load]);
  useEffect(loadWarehouses, [loadWarehouses]);

  async function adjust(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const delta = Number(String(f.get('delta') ?? '').trim());
    if (!Number.isInteger(delta) || delta === 0) {
      setFormError(new Error('invalid'));
      return;
    }
    setBusy(true);
    setFormError(null);
    setDone(false);
    key.current ??= newKey();
    try {
      await api.admin.inventory.adjust(
        {
          warehouseId: String(f.get('warehouseId') ?? '').trim(),
          variantId: String(f.get('variantId') ?? '').trim(),
          delta,
          reasonCode: String(f.get('reasonCode') ?? '').trim(),
        },
        key.current,
      );
      key.current = null;
      setDone(true);
      form.reset();
      load();
    } catch (e2) {
      setFormError(e2);
    } finally {
      setBusy(false);
    }
  }

  async function createWarehouse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setWhError(null);
    try {
      await api.admin.inventory.createWarehouse({
        code: String(f.get('code') ?? '').trim(),
        name: String(f.get('name') ?? '').trim(),
      });
      form.reset();
      setDone(true);
      loadWarehouses();
    } catch (e2) {
      setWhError(e2);
    }
  }

  return (
    <AdminShell>
      <h1 className="m-0 text-2xl font-extrabold">{t('title')}</h1>
      <div className="mt-4" aria-live="polite">
        {error ? (
          <ActionError error={error} onRetry={load} />
        ) : !rows ? (
          <Skeleton className="h-40" />
        ) : rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <caption className="sr-only">{t('title')}</caption>
              <thead className="bg-green-soft text-muted">
                <tr>
                  {[
                    'colWarehouse',
                    'colSku',
                    'colOnHand',
                    'colReserved',
                    'colQuarantined',
                    'colAvailable',
                  ].map((c) => (
                    <th key={c} scope="col" className="px-3 py-2.5">
                      {t(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.warehouseId}-${r.variantId}`} className="border-t border-line">
                    <td className="px-3 py-2.5">
                      {r.warehouseCode}
                      <br />
                      <code className="text-[11px] text-muted">{r.warehouseId}</code>
                    </td>
                    <td className="px-3 py-2.5 font-semibold">
                      {r.sku}
                      <br />
                      <code className="text-[11px] font-normal text-muted">{r.variantId}</code>
                    </td>
                    <td className="px-3 py-2.5">{r.onHand}</td>
                    <td className="px-3 py-2.5">{r.reserved}</td>
                    <td className="px-3 py-2.5">{r.quarantined}</td>
                    <td className="px-3 py-2.5 font-bold">{r.available}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <form onSubmit={adjust} noValidate className="rounded-card border border-line bg-white p-4">
          <h2 className="mt-0 text-[15px] font-bold">{t('adjust')}</h2>
          {formError ? <ActionError error={formError} /> : null}
          <Field id="a-wh" label={t('warehouse')}>
            {(a) => (
              <SelectInput {...a} name="warehouseId" required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field id="a-var" label={t('variantId')}>
            {(a) => <TextInput {...a} name="variantId" required />}
          </Field>
          <Field id="a-delta" label={t('delta')}>
            {(a) => <TextInput {...a} name="delta" inputMode="numeric" required />}
          </Field>
          <Field id="a-reason" label={t('reasonCode')}>
            {(a) => <TextInput {...a} name="reasonCode" maxLength={60} required />}
          </Field>
          <Button type="submit" loading={busy}>
            {t('submit')}
          </Button>
          {done ? (
            <p role="status" className="mb-0 mt-2 font-semibold text-green">
              {t('done')}
            </p>
          ) : null}
        </form>
        <form
          onSubmit={createWarehouse}
          noValidate
          className="rounded-card border border-line bg-white p-4"
        >
          <h2 className="mt-0 text-[15px] font-bold">{t('newWarehouse')}</h2>
          {whError ? <ActionError error={whError} /> : null}
          <Field id="w-code" label={t('whCode')}>
            {(a) => <TextInput {...a} name="code" maxLength={40} required />}
          </Field>
          <Field id="w-name" label={t('whName')}>
            {(a) => <TextInput {...a} name="name" maxLength={120} required />}
          </Field>
          <Button type="submit">{t('create')}</Button>
        </form>
      </div>
    </AdminShell>
  );
}

export default function InventoryPage() {
  return (
    <AuthGate realm="ADMIN">
      <Inventory />
    </AuthGate>
  );
}
