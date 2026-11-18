import { ApiError, NetworkError } from '@bizgo/contracts';

const KNOWN = [
  'CREDENTIALS_INVALID',
  'ACCOUNT_NOT_VERIFIED',
  'RATE_LIMITED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_LOCKED',
  'OTP_DELIVERY_NOT_CONFIGURED',
  'EMAIL_OR_PHONE_TAKEN',
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'ADDRESS_REQUIRED',
  'DELIVERY_UNSUPPORTED',
  'IDEMPOTENCY_CONFLICT',
  'IDEMPOTENCY_IN_PROGRESS',
  'INSUFFICIENT_STOCK',
  'OUT_OF_STOCK',
  'PRICE_CHANGED',
  'PRICE_NOT_SET',
  'QUANTITY_INVALID',
  'QUOTE_EXPIRED',
  'SHIPPING_FEE_UNDETERMINED',
  'TAX_POLICY_UNDETERMINED',
  'INVALID_STATE_TRANSITION',
  'NOT_FOUND',
];

/** Map an API/network failure to a message key under `errors.*` (UI strings live in messages/vi.json). */
export function errorKey(e: unknown): { key: string; requestId?: string } {
  if (e instanceof NetworkError) return { key: 'errors.network' };
  if (e instanceof ApiError) {
    return {
      key: KNOWN.includes(e.code) ? `errors.codes.${e.code}` : 'errors.generic',
      requestId: e.body.requestId || undefined,
    };
  }
  return { key: 'errors.generic' };
}

export function isUnauthenticated(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}
