'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, ErrorState, Field, TextInput } from '@bizgo/ui-web';
import { browserApi } from '@/lib/api';
import { errorKey } from '@/lib/errors';

function useApiError() {
  const t = useTranslations();
  const [msg, setMsg] = useState<{ text: string; requestId?: string } | null>(null);
  return {
    msg,
    clear: () => setMsg(null),
    set: (e: unknown) => {
      const { key, requestId } = errorKey(e);
      setMsg({ text: t(key), ...(requestId ? { requestId } : {}) });
    },
  };
}

function FormShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto my-8 w-full max-w-[460px] rounded-card border border-line bg-white p-6 shadow-card sm:p-8">
      <h1 className="mb-5 mt-0 text-2xl font-extrabold">{title}</h1>
      {children}
    </div>
  );
}

export function LoginForm() {
  const t = useTranslations('auth');
  const err = useApiError();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<{ identity?: string; password?: string }>({});
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const identity = String(f.get('identity') ?? '').trim();
    const password = String(f.get('password') ?? '');
    const problems: typeof fields = {};
    if (!identity) problems.identity = t('required');
    if (!password) problems.password = t('required');
    setFields(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    err.clear();
    try {
      const r = await browserApi().auth.login({ identity, password, realm: 'CUSTOMER' });
      setDone(r.user.displayName);
    } catch (e2) {
      err.set(e2);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <FormShell title={t('loggedInTitle')}>
        <p role="status">{t('loggedInText', { name: done })}</p>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await browserApi().auth.logout();
            } finally {
              setDone(null);
            }
          }}
        >
          {t('logout')}
        </Button>
      </FormShell>
    );
  }

  return (
    <FormShell title={t('loginTitle')}>
      <form onSubmit={submit} noValidate>
        {err.msg ? (
          <ErrorState
            title={err.msg.text}
            {...(err.msg.requestId ? { requestId: err.msg.requestId } : {})}
          />
        ) : null}
        <div className={err.msg ? 'mt-4' : ''}>
          <Field id="identity" label={t('identity')} error={fields.identity}>
            {(a) => (
              <TextInput
                {...a}
                name="identity"
                autoComplete="username"
                inputMode="email"
                maxLength={254}
              />
            )}
          </Field>
          <Field id="password" label={t('password')} error={fields.password}>
            {(a) => (
              <TextInput
                {...a}
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
              />
            )}
          </Field>
        </div>
        <Button type="submit" loading={busy} className="w-full">
          {t('loginSubmit')}
        </Button>
      </form>
      <p className="mb-0 mt-5 text-[13px]">
        {t('noAccount')}{' '}
        <Link href="/dang-ky" className="font-bold text-green">
          {t('registerLink')}
        </Link>
      </p>
    </FormShell>
  );
}

export function RegisterForm() {
  const t = useTranslations('auth');
  const err = useApiError();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string | undefined>>({});
  const [step, setStep] = useState<'form' | 'otp' | 'done'>('form');
  const [identity, setIdentity] = useState('');
  const [target, setTarget] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const id = String(f.get('identity') ?? '').trim();
    const displayName = String(f.get('displayName') ?? '').trim();
    const password = String(f.get('password') ?? '');
    const acceptTerms = f.get('acceptTerms') === 'on';
    const problems: Record<string, string> = {};
    if (!displayName) problems.displayName = t('required');
    if (!id) problems.identity = t('required');
    if (password.length < 10) problems.password = t('passwordShort');
    if (!acceptTerms) problems.acceptTerms = t('termsRequired');
    setFields(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    err.clear();
    try {
      const r = await browserApi().auth.register({
        identity: id,
        password,
        displayName,
        acceptTerms,
      });
      setIdentity(id);
      setTarget(r.target);
      setCooldown(r.resendAfterSec);
      setStep('otp');
    } catch (e2) {
      err.set(e2);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').trim();
    if (!/^\d{6}$/.test(code)) {
      setFields({ code: t('required') });
      return;
    }
    setFields({});
    setBusy(true);
    err.clear();
    try {
      await browserApi().auth.verifyOtp({ identity, code });
      setStep('done');
    } catch (e2) {
      err.set(e2);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    err.clear();
    try {
      const r = await browserApi().auth.resendOtp({ identity });
      setCooldown(r.resendAfterSec);
    } catch (e2) {
      err.set(e2);
    }
  }

  if (step === 'done') {
    return (
      <FormShell title={t('verifiedTitle')}>
        <p role="status">{t('verifiedText')}</p>
        <Link
          href="/dang-nhap"
          className="inline-flex min-h-tap items-center rounded-control bg-green px-5 text-[13px] font-bold text-white"
        >
          {t('loginLink')}
        </Link>
      </FormShell>
    );
  }

  if (step === 'otp') {
    return (
      <FormShell title={t('otpTitle')}>
        <p>{t('otpText', { target })}</p>
        <form onSubmit={verify} noValidate>
          {err.msg ? (
            <ErrorState
              title={err.msg.text}
              {...(err.msg.requestId ? { requestId: err.msg.requestId } : {})}
            />
          ) : null}
          <div className={err.msg ? 'mt-4' : ''}>
            <Field id="code" label={t('otpCode')} error={fields.code}>
              {(a) => (
                <TextInput
                  {...a}
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="\d{6}"
                />
              )}
            </Field>
          </div>
          <Button type="submit" loading={busy} className="w-full">
            {t('otpSubmit')}
          </Button>
        </form>
        <Button variant="ghost" className="mt-3 w-full" disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? t('otpResendIn', { seconds: cooldown }) : t('otpResend')}
        </Button>
      </FormShell>
    );
  }

  return (
    <FormShell title={t('registerTitle')}>
      <form onSubmit={submit} noValidate>
        {err.msg ? (
          <ErrorState
            title={err.msg.text}
            {...(err.msg.requestId ? { requestId: err.msg.requestId } : {})}
          />
        ) : null}
        <div className={err.msg ? 'mt-4' : ''}>
          <Field id="displayName" label={t('displayName')} error={fields.displayName}>
            {(a) => <TextInput {...a} name="displayName" autoComplete="name" maxLength={100} />}
          </Field>
          <Field id="identity" label={t('identity')} error={fields.identity}>
            {(a) => <TextInput {...a} name="identity" autoComplete="username" maxLength={254} />}
          </Field>
          <Field
            id="password"
            label={t('password')}
            hint={t('passwordHint')}
            error={fields.password}
          >
            {(a) => (
              <TextInput
                {...a}
                name="password"
                type="password"
                autoComplete="new-password"
                maxLength={128}
              />
            )}
          </Field>
          <div className="mb-4">
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                name="acceptTerms"
                className="mt-1 h-5 w-5 shrink-0"
                aria-describedby={fields.acceptTerms ? 'terms-error' : undefined}
              />
              <span>{t('acceptTerms')}</span>
            </label>
            {fields.acceptTerms ? (
              <p id="terms-error" role="alert" className="mt-1 text-xs font-semibold text-danger">
                {fields.acceptTerms}
              </p>
            ) : null}
          </div>
        </div>
        <Button type="submit" loading={busy} className="w-full">
          {t('registerSubmit')}
        </Button>
      </form>
      <p className="mb-0 mt-5 text-[13px]">
        {t('haveAccount')}{' '}
        <Link href="/dang-nhap" className="font-bold text-green">
          {t('loginLink')}
        </Link>
      </p>
    </FormShell>
  );
}
