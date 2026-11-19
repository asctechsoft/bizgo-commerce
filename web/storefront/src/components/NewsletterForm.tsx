'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@bizgo/ui-web';
import { browserApi } from '@/lib/api';
import { ApiErrorBox } from './ApiErrorBox';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email signup (POST /v1/inquiries kind=NEWSLETTER). Explicit consent checkbox; the server never reveals duplicates. */
export function NewsletterForm() {
  const t = useTranslations('guides');
  const ti = useTranslations('inquiry');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<unknown>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email') ?? '').trim();
    if (!EMAIL_RE.test(email)) return setError(email ? ti('emailInvalid') : ti('required'));
    if (f.get('consent') !== 'on') return setError(ti('consentRequired'));
    setError(null);
    setApiError(null);
    setBusy(true);
    try {
      await browserApi().content.inquire({
        kind: 'NEWSLETTER',
        email,
        consent: true,
        website: String(f.get('website') ?? ''),
      });
      setDone(true);
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="m-0 text-[13px] font-semibold text-[#133e24]">
        ✅ {t('newsletterDone')}
      </p>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="w-full max-w-[460px]">
      {apiError ? (
        <div className="mb-2">
          <ApiErrorBox error={apiError} />
        </div>
      ) : null}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="nl-email">
          {t('newsletterEmail')}
        </label>
        <input
          id="nl-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          placeholder={t('newsletterEmailPh')}
          aria-invalid={!!error}
          aria-describedby={error ? 'nl-err' : undefined}
          className="min-h-tap min-w-0 flex-1 rounded-control border border-line bg-white px-3 text-[13px] placeholder:text-muted aria-[invalid=true]:border-danger"
        />
        <Button type="submit" loading={busy} className="shrink-0">
          {t('newsletterSubmit')}
        </Button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="consent" className="h-4 w-4" />
        {t('newsletterConsent')}
      </label>
      {error ? (
        <p id="nl-err" role="alert" className="m-0 mt-1 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
