'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError } from '@bizgo/contracts';
import { Button, Field, TextInput } from '@bizgo/ui-web';
import { errorKey } from '@/lib/api';
import { useBackoffice } from './AuthGate';

/** Shows a failed admin call. STEP_UP_REQUIRED offers an inline MFA re-verification, then `onRetry`. */
export function ActionError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations();
  const { api } = useBackoffice();
  const [busy, setBusy] = useState(false);
  const [stepErr, setStepErr] = useState<string | null>(null);
  const k = errorKey(error);
  const details =
    error instanceof ApiError && error.code === 'SKU_NOT_READY'
      ? error.body.details.map((d) => String(d.message ?? d.item ?? ''))
      : [];

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').trim();
    setBusy(true);
    setStepErr(null);
    try {
      await api.auth.mfaVerify(code);
      onRetry?.();
    } catch (e2) {
      setStepErr(t(errorKey(e2).key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="alert"
      className="my-3 rounded-control border border-[#f0c9c5] bg-[#fdf2f1] p-3 text-[13px]"
    >
      <strong className="text-danger">{t(k.key)}</strong>
      {details.length ? (
        <ul className="mb-0 mt-1 pl-5">
          {details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}
      {k.requestId ? <p className="mb-0 mt-1 text-[11px] text-muted">{k.requestId}</p> : null}
      {error instanceof ApiError && error.code === 'STEP_UP_REQUIRED' ? (
        <form onSubmit={verify} noValidate className="mt-3">
          <Field id="stepup-code" label={t('stepUp.code')} error={stepErr ?? undefined}>
            {(a) => (
              <TextInput
                {...a}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={11}
              />
            )}
          </Field>
          <Button type="submit" loading={busy}>
            {t('stepUp.submit')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
