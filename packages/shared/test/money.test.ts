import { allocate, applyBps, formatVnd, mulInt, vnd, vndToJson, MoneyError } from '../src';

describe('money', () => {
  it('rejects fractional and unsafe numbers', () => {
    expect(() => vnd(10.5)).toThrow(MoneyError);
    expect(() => vnd(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
    expect(() => vnd('12.5')).toThrow(MoneyError);
    expect(vnd('1250000')).toBe(1_250_000n);
  });

  it('serialises to JSON safely and fails above safe range', () => {
    expect(vndToJson(5_000_000_000n)).toBe(5_000_000_000);
    expect(() => vndToJson(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(MoneyError);
  });

  it('multiplies by integer quantities only', () => {
    expect(mulInt(12_500n, 3)).toBe(37_500n);
    expect(() => mulInt(12_500n, 1.5)).toThrow(MoneyError);
  });

  it('applies basis points with half-up rounding', () => {
    expect(applyBps(1_000n, 1000)).toBe(100n); // 10%
    expect(applyBps(1_001n, 1000)).toBe(100n); // 100.1 -> 100
    expect(applyBps(1_005n, 1000)).toBe(101n); // 100.5 -> 101
  });

  it('allocates exactly with largest remainder', () => {
    const parts = allocate(100n, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100n);
    expect(parts).toEqual([34n, 33n, 33n]);
  });

  it('allocation always sums to the total (property check)', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 500; n++) {
      const total = BigInt(Math.floor(rnd() * 5_000_000));
      const weights = Array.from(
        { length: 1 + Math.floor(rnd() * 8) },
        () => 1 + Math.floor(rnd() * 1000),
      );
      const parts = allocate(total, weights);
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
      expect(parts.every((p) => p >= 0n)).toBe(true);
    }
  });

  it('allocates negative totals symmetrically', () => {
    const parts = allocate(-100n, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(-100n);
  });

  it('rejects empty/zero weights', () => {
    expect(() => allocate(10n, [])).toThrow(MoneyError);
    expect(() => allocate(10n, [0, 0])).toThrow(MoneyError);
  });

  it('formats Vietnamese grouping', () => {
    expect(formatVnd(1_250_000n)).toBe('1.250.000 ₫');
    expect(formatVnd(0n)).toBe('0 ₫');
    expect(formatVnd(-5_000n)).toBe('-5.000 ₫');
  });
});
