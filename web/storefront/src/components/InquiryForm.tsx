'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Field, SelectInput, TextInput } from '@bizgo/ui-web';
import { browserApi } from '@/lib/api';
import { ApiErrorBox } from './ApiErrorBox';

const BUSINESS_TYPES = [
  'MILK_TEA_SHOP',
  'DESSERT_SHOP',
  'SNACK_SHOP',
  'DISTRIBUTOR',
  'AGENT',
  'OTHER',
] as const;
const TOPICS = [
  'QUOTE',
  'WHOLESALE_AGENT',
  'PRODUCT_ADVICE',
  'ORDER_SUPPORT',
  'PARTNERSHIP',
  'OTHER',
] as const;
const PHONE_RE = /^(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEXTAREA =
  'min-h-[96px] w-full rounded-control border border-line bg-white px-3 py-2 text-[14px] text-ink placeholder:text-muted aria-[invalid=true]:border-danger';

/**
 * Public lead form. `quote` = B2B quote request (business type, area, interest); `contact` = general contact
 * (email, topic, message). Both post to POST /v1/inquiries; the server validates, rate-limits and stores them.
 */
export function InquiryForm({ kind }: { kind: 'QUOTE' | 'CONTACT' }) {
  const t = useTranslations('inquiry');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const quote = kind === 'QUOTE';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const v = (k: string) => String(f.get(k) ?? '').trim();
    const p: Record<string, string> = {};
    if (!v('fullName')) p.fullName = t('required');
    if (!v('phone')) p.phone = t('required');
    else if (!PHONE_RE.test(v('phone'))) p.phone = t('phoneInvalid');
    if (quote) {
      if (!v('businessType')) p.businessType = t('required');
      if (!v('province')) p.province = t('required');
    } else {
      if (!v('email')) p.email = t('required');
      else if (!EMAIL_RE.test(v('email'))) p.email = t('emailInvalid');
      if (!v('topic')) p.topic = t('required');
    }
    if (!v('message')) p.message = t('required');
    else if (v('message').length < 10) p.message = t('messageShort');
    if (f.get('consent') !== 'on') p.consent = t('consentRequired');
    setErrors(p);
    if (Object.keys(p).length) return;
    setBusy(true);
    setApiError(null);
    try {
      await browserApi().content.inquire({
        kind,
        fullName: v('fullName'),
        phone: v('phone'),
        message: v('message'),
        consent: true,
        website: v('website'),
        ...(quote
          ? { businessType: v('businessType'), province: v('province'), topic: 'QUOTE' }
          : { email: v('email'), topic: v('topic') }),
      });
      form.reset();
      setDone(true);
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-card bg-green-mint p-6 text-center">
        <div aria-hidden="true" className="text-4xl">
          ✅
        </div>
        <h3 className="m-0 mt-2 text-[17px] font-extrabold text-[#133e24]">{t('successTitle')}</h3>
        <p className="m-0 mt-1.5 text-[13px] text-muted">{t('successText')}</p>
        <Button variant="secondary" className="mt-4" onClick={() => setDone(false)}>
          {t('again')}
        </Button>
      </div>
    );
  }

  const id = `inq-${kind.toLowerCase()}`;
  return (
    <form onSubmit={submit} noValidate>
      {apiError ? (
        <div className="mb-4">
          <ApiErrorBox error={apiError} />
        </div>
      ) : null}
      {/* honeypot: hidden from people and assistive tech; bots tend to fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field id={`${id}-name`} label={`${t('fullName')} *`} error={errors.fullName}>
          {(a) => (
            <TextInput
              {...a}
              name="fullName"
              placeholder={t('fullNamePh')}
              autoComplete="name"
              maxLength={120}
            />
          )}
        </Field>
        <Field id={`${id}-phone`} label={`${t('phone')} *`} error={errors.phone}>
          {(a) => (
            <TextInput
              {...a}
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder={t('phonePh')}
              autoComplete="tel"
              maxLength={20}
            />
          )}
        </Field>
        {quote ? (
          <>
            <Field id={`${id}-biz`} label={`${t('businessType')} *`} error={errors.businessType}>
              {(a) => (
                <SelectInput {...a} name="businessType" defaultValue="">
                  <option value="" disabled>
                    {t('businessTypePh')}
                  </option>
                  {BUSINESS_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {t(`businessTypes.${b}`)}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
            <Field id={`${id}-province`} label={`${t('province')} *`} error={errors.province}>
              {(a) => (
                <TextInput
                  {...a}
                  name="province"
                  placeholder={t('provincePh')}
                  autoComplete="address-level1"
                  maxLength={80}
                />
              )}
            </Field>
          </>
        ) : (
          <>
            <Field id={`${id}-email`} label={`${t('email')} *`} error={errors.email}>
              {(a) => (
                <TextInput
                  {...a}
                  name="email"
                  type="email"
                  placeholder={t('emailPh')}
                  autoComplete="email"
                  maxLength={254}
                />
              )}
            </Field>
            <Field id={`${id}-topic`} label={`${t('topic')} *`} error={errors.topic}>
              {(a) => (
                <SelectInput {...a} name="topic" defaultValue="">
                  <option value="" disabled>
                    {t('topicPh')}
                  </option>
                  {TOPICS.map((o) => (
                    <option key={o} value={o}>
                      {t(`topics.${o}`)}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>
          </>
        )}
      </div>
      <Field
        id={`${id}-msg`}
        label={`${quote ? t('interest') : t('message')} *`}
        error={errors.message}
      >
        {(a) => (
          <textarea
            {...a}
            name="message"
            rows={quote ? 3 : 4}
            maxLength={2000}
            placeholder={quote ? t('interestPh') : t('messagePh')}
            className={TEXTAREA}
          />
        )}
      </Field>
      <div className="mb-4">
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            name="consent"
            aria-invalid={!!errors.consent}
            aria-describedby={errors.consent ? `${id}-consent-err` : undefined}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          {t('consent')}
        </label>
        {errors.consent ? (
          <p
            id={`${id}-consent-err`}
            role="alert"
            className="mt-1 text-xs font-semibold text-danger"
          >
            {errors.consent}
          </p>
        ) : null}
      </div>
      <Button type="submit" loading={busy} className={quote ? 'w-full' : 'px-8'}>
        {quote ? t('submitQuote') : t('submitContact')}
      </Button>
    </form>
  );
}
