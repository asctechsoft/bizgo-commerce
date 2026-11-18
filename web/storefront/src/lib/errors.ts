import { ApiError, NetworkError } from '@bizgo/contracts';

/** Map an API/network failure to a message key under `errors.*` (UI strings live in messages/vi.json). */
export function errorKey(e: unknown): { key: string; requestId?: string } {
  if (e instanceof NetworkError) return { key: 'errors.network' };
  if (e instanceof ApiError) {
    const known = [
      'CREDENTIALS_INVALID',
      'ACCOUNT_NOT_VERIFIED',
      'RATE_LIMITED',
      'OTP_INVALID',
      'OTP_EXPIRED',
      'OTP_LOCKED',
      'OTP_DELIVERY_NOT_CONFIGURED',
      'EMAIL_OR_PHONE_TAKEN',
      'VALIDATION_ERROR',
    ];
    return {
      key: known.includes(e.code) ? `errors.codes.${e.code}` : 'errors.generic',
      requestId: e.body.requestId || undefined,
    };
  }
  return { key: 'errors.generic' };
}
