'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, type ApiClient, type Realm, type SessionSummary } from '@bizgo/contracts';
import { Button, ErrorState, Field, Skeleton, TextInput } from '@bizgo/ui-web';
import { backofficeApi, errorKey } from '@/lib/api';

type BackRealm = Exclude<Realm, 'CUSTOMER'>;

interface Ctx {
  session: SessionSummary;
  api: ApiClient;
  logout: () => Promise<void>;
}
const SessionCtx = createContext<Ctx | null>(null);
export const useBackoffice = (): Ctx => {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useBackoffice outside AuthGate');
  return c;
};

const LOGIN_PATH: Record<BackRealm, string> = { ADMIN: '/admin/login', FACTORY: '/factory/login' };

/**
 * UX-only gate (the API enforces everything): loads the session, redirects to login, and blocks the app
 * until MFA is verified for roles that require it.
 */
export function AuthGate({ realm, children }: { realm: BackRealm; children: ReactNode }) {
  const router = useRouter();
  const api = useMemo(() => backofficeApi(realm), [realm]);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [failure, setFailure] = useState<{ key: string; requestId?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      setSession(await api.auth.session());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.code !== 'MFA_REQUIRED') {
        router.replace(LOGIN_PATH[realm]);
        return;
      }
      setFailure(errorKey(e));
    } finally {
      setLoading(false);
    }
  }, [api, realm, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      router.replace(LOGIN_PATH[realm]);
    }
  }, [api, realm, router]);

  const t = useTranslations();
  if (loading) {
    return (
      <div aria-busy="true" className="mx-auto max-w-3xl p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-6 h-40" />
      </div>
    );
  }
  if (failure) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <ErrorState
          title={t('errors.title')}
          description={t(failure.key)}
          {...(failure.requestId ? { requestId: failure.requestId } : {})}
          action={<Button onClick={() => void load()}>{t('common.retry')}</Button>}
        />
      </div>
    );
  }
  if (!session) return null;
  if (session.mfa.required && !session.mfa.verified) {
    return (
      <MfaPanel
        api={api}
        enrolled={session.mfa.enrolled}
        onDone={() => void load()}
        onLogout={logout}
      />
    );
  }
  return <SessionCtx.Provider value={{ session, api, logout }}>{children}</SessionCtx.Provider>;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto my-10 w-full max-w-[480px] rounded-card border border-line bg-white p-6 shadow-card sm:p-8">
      <h1 className="mb-5 mt-0 text-2xl font-extrabold">{title}</h1>
      {children}
    </main>
  );
}

function MfaPanel({
  api,
  enrolled,
  onDone,
  onLogout,
}: {
  api: ApiClient;
  enrolled: boolean;
  onDone: () => void;
  onLogout: () => void;
}) {
  const t = useTranslations('mfa');
  const te = useTranslations();
  const [secret, setSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setSecret(await api.auth.mfaEnroll());
    } catch (e) {
      setError(te(errorKey(e).key));
    } finally {
      setBusy(false);
    }
  }

  async function verify(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const code = String(new FormData(ev.currentTarget).get('code') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      const r = await api.auth.mfaVerify(code);
      if (r.recoveryCodes) setRecovery(r.recoveryCodes);
      else onDone();
    } catch (e) {
      setError(te(errorKey(e).key));
    } finally {
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <Shell title={t('recoveryTitle')}>
        <p>{t('recoveryText')}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-control bg-green-soft p-3 font-mono text-[13px]">
          {recovery.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button className="mt-4 w-full" onClick={onDone}>
          {t('recoveryDone')}
        </Button>
      </Shell>
    );
  }

  const needEnroll = !enrolled && !secret;
  return (
    <Shell title={t('title')}>
      <p className="text-[13px]">{needEnroll || secret ? t('enrollText') : t('verifyText')}</p>
      {error ? (
        <p role="alert" className="mb-3 font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {needEnroll ? (
        <Button onClick={start} loading={busy} className="w-full">
          {t('enrollStart')}
        </Button>
      ) : (
        <>
          {secret ? (
            <div className="mb-4 rounded-control bg-green-soft p-3 text-[13px]">
              <strong>{t('secret')}</strong>
              <code className="mt-1 block break-all font-mono text-[14px]">{secret.secret}</code>
              <a className="mt-2 inline-block text-green underline" href={secret.otpauthUrl}>
                {t('otpauth')}
              </a>
            </div>
          ) : null}
          <form onSubmit={verify} noValidate>
            <Field id="mfa-code" label={t('code')}>
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
            <Button type="submit" loading={busy} className="w-full">
              {t('submit')}
            </Button>
          </form>
        </>
      )}
      <Button variant="ghost" className="mt-3 w-full" onClick={onLogout}>
        {te('common.logout')}
      </Button>
    </Shell>
  );
}

export function LoginPanel({
  realm,
  title,
  redirectTo,
}: {
  realm: BackRealm;
  title: string;
  redirectTo: string;
}) {
  const t = useTranslations('login');
  const te = useTranslations();
  const router = useRouter();
  const api = useMemo(() => backofficeApi(realm), [realm]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const identity = String(f.get('identity') ?? '').trim();
    const password = String(f.get('password') ?? '');
    const errs: Record<string, string> = {};
    if (!identity) errs.identity = t('required');
    if (!password) errs.password = t('required');
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.login({ identity, password, realm });
      router.replace(redirectTo);
    } catch (e) {
      setError(te(errorKey(e).key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={title}>
      <form onSubmit={submit} noValidate>
        {error ? (
          <p role="alert" className="mb-3 font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <Field id="identity" label={t('identity')} error={fieldErr.identity}>
          {(a) => <TextInput {...a} name="identity" autoComplete="username" maxLength={254} />}
        </Field>
        <Field id="password" label={t('password')} error={fieldErr.password}>
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
        <Button type="submit" loading={busy} className="w-full">
          {t('submit')}
        </Button>
      </form>
    </Shell>
  );
}
