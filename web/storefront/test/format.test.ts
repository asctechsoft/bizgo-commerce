import { describe, expect, it } from 'vitest';
import { formatVnd, newIdempotencyKey } from '../src/lib/format';

describe('format', () => {
  it('never renders an undetermined amount as 0', () => {
    expect(formatVnd(null)).toBeNull();
    expect(formatVnd(undefined)).toBeNull();
  });
  it('formats VND without decimals', () => {
    expect(formatVnd(15000)).toMatch(/15\.000/);
  });
  it('generates distinct idempotency keys per attempt', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
