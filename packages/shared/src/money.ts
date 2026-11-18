/**
 * Money helpers (ADR-0003). All amounts are integer VND (đồng) held as bigint.
 * Floating point is never used for money.
 */
export type Vnd = bigint;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Convert an unknown number/string/bigint into integer VND; rejects fractions and unsafe values. */
export function vnd(value: number | string | bigint): Vnd {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value))
      throw new MoneyError(`Amount must be an integer VND, got ${value}`);
    if (!Number.isSafeInteger(value)) throw new MoneyError('Amount exceeds safe integer range');
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value))
    throw new MoneyError(`Amount must be an integer string, got "${value}"`);
  return BigInt(value);
}

/** Serialise for JSON. Fails loudly instead of silently losing precision. */
export function vndToJson(value: Vnd): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError('Amount exceeds JSON safe integer range');
  }
  return Number(value);
}

export function mulInt(amount: Vnd, qty: number | bigint): Vnd {
  const q = typeof qty === 'bigint' ? qty : BigInt(assertInt(qty));
  return amount * q;
}

/** Percentage in basis points (1% = 100 bps), rounded half up, for non-negative amounts. */
export function applyBps(amount: Vnd, bps: number): Vnd {
  assertInt(bps);
  if (amount < 0n) throw new MoneyError('applyBps expects a non-negative amount');
  if (bps < 0) throw new MoneyError('bps must be non-negative');
  return (amount * BigInt(bps) + 5000n) / 10000n;
}

/**
 * Split `total` over `weights` using the largest-remainder method.
 * Guarantees the parts sum exactly to `total` (no cent lost or created).
 */
export function allocate(total: Vnd, weights: readonly (number | bigint)[]): Vnd[] {
  if (weights.length === 0) throw new MoneyError('allocate requires at least one weight');
  const w = weights.map((x) => (typeof x === 'bigint' ? x : BigInt(assertInt(x))));
  if (w.some((x) => x < 0n)) throw new MoneyError('weights must be non-negative');
  const sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new MoneyError('weights must not all be zero');
  const sign = total < 0n ? -1n : 1n;
  const abs = total * sign;
  const base = w.map((x) => (abs * x) / sum);
  let remainder = abs - base.reduce((a, b) => a + b, 0n);
  const order = w
    .map((x, i) => ({ i, rem: (abs * x) % sum }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const { i } of order) {
    if (remainder === 0n) break;
    base[i] = (base[i] as bigint) + 1n;
    remainder -= 1n;
  }
  return base.map((x) => x * sign);
}

/** Vietnamese display, e.g. 1.250.000 ₫. Presentation only; never parse this back. */
export function formatVnd(value: Vnd): string {
  const neg = value < 0n;
  const digits = (neg ? -value : value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${grouped} ₫`;
}

function assertInt(n: number): number {
  if (!Number.isInteger(n)) throw new MoneyError(`Expected an integer, got ${n}`);
  return n;
}
