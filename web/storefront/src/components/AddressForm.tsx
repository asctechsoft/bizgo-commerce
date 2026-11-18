'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, TextInput } from '@bizgo/ui-web';
import type { Address } from '@bizgo/contracts';
import { browserApi } from '@/lib/api';
import { ApiErrorBox } from './ApiErrorBox';

const FIELDS = ['receiverName', 'phone', 'province', 'district', 'ward', 'detail'] as const;

export function AddressForm({ onCreated }: { onCreated: (a: Address) => void }) {
  const t = useTranslations('address');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<unknown>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = Object.fromEntries(
      FIELDS.map((k) => [k, String(f.get(k) ?? '').trim()]),
    ) as Record<(typeof FIELDS)[number], string>;
    const problems: Record<string, string> = {};
    for (const k of FIELDS) if (!values[k]) problems[k] = t('required');
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setApiError(null);
    try {
      const created = await browserApi().addresses.create({
        ...values,
        isDefault: f.get('isDefault') === 'on',
      });
      onCreated(created);
    } catch (e2) {
      setApiError(e2);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-card border border-line bg-white p-4">
      {apiError ? <ApiErrorBox error={apiError} /> : null}
      <div className={apiError ? 'mt-4' : ''}>
        {FIELDS.map((k) => (
          <Field key={k} id={`addr-${k}`} label={t(k)} error={errors[k]}>
            {(a) => (
              <TextInput
                {...a}
                name={k}
                maxLength={k === 'detail' ? 200 : 100}
                autoComplete={k === 'receiverName' ? 'name' : k === 'phone' ? 'tel' : 'off'}
                inputMode={k === 'phone' ? 'tel' : undefined}
              />
            )}
          </Field>
        ))}
      </div>
      <label className="mb-4 flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="isDefault" className="h-5 w-5" />
        {t('isDefault')}
      </label>
      <Button type="submit" loading={busy}>
        {t('save')}
      </Button>
    </form>
  );
}
