import { ApiError, NetworkError, createApiClient, type Realm } from '@bizgo/contracts';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1] as string) : null;
}

const CSRF_COOKIE: Record<Realm, string> = {
  CUSTOMER: 'bg_csrf',
  ADMIN: 'bg_admin_csrf',
  FACTORY: 'bg_factory_csrf',
};

/** Browser client for a backoffice realm: cookie session + X-Realm hint + double-submit CSRF. */
export function backofficeApi(realm: Exclude<Realm, 'CUSTOMER'>) {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000',
    credentials: 'include',
    cache: 'no-store',
    realm,
    getCsrfToken: () => readCookie(CSRF_COOKIE[realm]),
  });
}

export function errorKey(e: unknown): { key: string; requestId?: string; status?: number } {
  if (e instanceof NetworkError) return { key: 'errors.network' };
  if (e instanceof ApiError) {
    const known = [
      'CREDENTIALS_INVALID',
      'RATE_LIMITED',
      'OTP_INVALID',
      'OTP_LOCKED',
      'FORBIDDEN',
      'MFA_REQUIRED',
      'VALIDATION_ERROR',
      'STEP_UP_REQUIRED',
      'SKU_NOT_READY',
      'INVALID_STATE_TRANSITION',
      'NOT_FOUND',
      'INSUFFICIENT_STOCK',
      'IDEMPOTENCY_CONFLICT',
      'IDEMPOTENCY_IN_PROGRESS',
    ];
    return {
      key: known.includes(e.code) ? `errors.codes.${e.code}` : 'errors.generic',
      status: e.status,
      ...(e.body.requestId ? { requestId: e.body.requestId } : {}),
    };
  }
  return { key: 'errors.generic' };
}

/** One key per user action; reused only for retries of the same action. */
export function newKey(): string {
  return globalThis.crypto.randomUUID();
}
