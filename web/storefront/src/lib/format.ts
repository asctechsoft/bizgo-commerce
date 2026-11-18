const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

/** Format a backend-provided VND amount. `null` means "not determined" and is NEVER rendered as 0. */
export function formatVnd(v: number | null | undefined): string | null {
  return v === null || v === undefined ? null : vnd.format(v);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** One random key per user attempt (reuse on network retry, regenerate after a definitive result). */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
