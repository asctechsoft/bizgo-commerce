import type { IdentityType } from '@bizgo/db';
import { AppError } from '@bizgo/shared';

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function detectIdentityType(raw: string): IdentityType {
  return raw.includes('@') ? 'EMAIL' : 'PHONE';
}

/**
 * Canonical identity value. Email: trimmed lowercase. Vietnamese phone: digits only, +84/84 → 0.
 * Throws VALIDATION_ERROR for malformed input.
 */
export function normalizeIdentity(type: IdentityType, raw: string): string {
  const value = raw.trim();
  if (type === 'EMAIL') {
    const email = value.toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      throw new AppError('VALIDATION_ERROR', 'Email không hợp lệ.');
    }
    return email;
  }
  const digits = value.replace(/[\s.\-()]/g, '');
  const m = digits.match(/^(?:\+?84|0)(\d{9})$/);
  if (!m) throw new AppError('VALIDATION_ERROR', 'Số điện thoại không hợp lệ.');
  return `0${m[1]}`;
}

export function maskIdentity(type: IdentityType, norm: string): string {
  if (type === 'EMAIL') {
    const [local = '', domain = ''] = norm.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${norm.slice(0, 3)}****${norm.slice(-3)}`;
}
