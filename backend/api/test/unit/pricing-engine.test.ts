import {
  computeQuote,
  resolveUnitPrice,
  type QuoteLineInput,
  type QuotePolicy,
} from '../../src/commerce/pricing.engine';
import { evaluateSkuGate } from '../../src/commerce/sku-gate';

const NOW = new Date('2026-11-18T10:00:00Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000);

const policy: QuotePolicy = {
  appEnv: 'test',
  shippingPolicy: 'MANUAL_QUOTE',
  taxPolicy: 'INCLUSIVE',
  allowedProvinces: ['Hà Nội'],
  chilledProvinces: [],
};

const line = (over: Partial<QuoteLineInput> = {}): QuoteLineInput => ({
  variantId: 'v1',
  sku: 'TEST-1',
  name: 'Hàng thử',
  packLabel: 'TEST 1kg',
  netWeightG: 1000,
  storageClass: 'DRY',
  variantActive: true,
  productActive: true,
  isTest: true,
  minQty: 1,
  maxQty: null,
  quantityStep: 1,
  quantity: 2,
  rules: [{ minQty: 1, unitPriceVnd: 10_000n, validFrom: ago(1), validTo: null, priority: 0 }],
  available: 10n,
  ...over,
});

const hn = { province: 'Hà Nội' };

describe('resolveUnitPrice', () => {
  it('picks the highest quantity break and priority, only inside the validity window', () => {
    const rules = [
      { minQty: 1, unitPriceVnd: 100n, validFrom: ago(5), validTo: null, priority: 0 },
      { minQty: 10, unitPriceVnd: 90n, validFrom: ago(5), validTo: null, priority: 0 },
      { minQty: 10, unitPriceVnd: 85n, validFrom: ago(5), validTo: null, priority: 5 },
      { minQty: 1, unitPriceVnd: 1n, validFrom: ago(9), validTo: ago(8), priority: 9 }, // expired
      {
        minQty: 1,
        unitPriceVnd: 2n,
        validFrom: new Date(NOW.getTime() + 3600_000),
        validTo: null,
        priority: 9,
      }, // future
    ];
    expect(resolveUnitPrice(rules, 1, NOW)).toBe(100n);
    expect(resolveUnitPrice(rules, 9, NOW)).toBe(100n);
    expect(resolveUnitPrice(rules, 10, NOW)).toBe(85n);
    expect(resolveUnitPrice([], 1, NOW)).toBeNull();
  });

  it('treats validTo as exclusive', () => {
    const r = [{ minQty: 1, unitPriceVnd: 5n, validFrom: ago(2), validTo: NOW, priority: 0 }];
    expect(resolveUnitPrice(r, 1, NOW)).toBeNull();
  });
});

describe('computeQuote', () => {
  it('computes exact integer totals and allows a clean order', () => {
    const q = computeQuote([line({ quantity: 3 })], hn, policy, NOW);
    expect(q.canPlaceOrder).toBe(true);
    expect(q.blockers).toEqual([]);
    expect(q.lines[0]?.lineTotalVnd).toBe(30_000n);
    expect(q.subtotalVnd).toBe(30_000n);
    expect(q.shippingFeeVnd).toBeNull(); // shipping is never fabricated
    expect(q.shippingNote).toBe('MANUAL_QUOTE');
    expect(q.totalVnd).toBe(30_000n);
  });

  it('blocks everything that is undetermined and returns a null total (never zero)', () => {
    const q = computeQuote(
      [line()],
      null,
      { ...policy, shippingPolicy: 'BLOCK', taxPolicy: 'UNDETERMINED', allowedProvinces: [] },
      NOW,
    );
    const codes = q.blockers.map((b) => b.code).sort();
    expect(codes).toEqual([
      'ADDRESS_REQUIRED',
      'SHIPPING_FEE_UNDETERMINED',
      'TAX_POLICY_UNDETERMINED',
    ]);
    expect(q.canPlaceOrder).toBe(false);
    expect(q.totalVnd).toBeNull();
  });

  it('SKU_NOT_READY for draft variants/products and for TEST SKUs in production', () => {
    expect(computeQuote([line({ variantActive: false })], hn, policy, NOW).blockers[0]?.code).toBe(
      'SKU_NOT_READY',
    );
    expect(computeQuote([line({ productActive: false })], hn, policy, NOW).blockers[0]?.code).toBe(
      'SKU_NOT_READY',
    );
    const prod = computeQuote([line()], hn, { ...policy, appEnv: 'production' }, NOW);
    expect(prod.blockers.map((b) => b.code)).toContain('SKU_NOT_READY');
  });

  it('PRICE_NOT_SET when no live rule exists', () => {
    const q = computeQuote([line({ rules: [] })], hn, policy, NOW);
    expect(q.blockers.map((b) => b.code)).toContain('PRICE_NOT_SET');
    expect(q.subtotalVnd).toBeNull();
    expect(q.totalVnd).toBeNull();
  });

  it('validates quantity bounds and step', () => {
    const base = { minQty: 2, maxQty: 10, quantityStep: 2 };
    for (const quantity of [1, 3, 12, 0]) {
      expect(
        computeQuote([line({ ...base, quantity })], hn, policy, NOW).blockers.map((b) => b.code),
      ).toContain('QUANTITY_INVALID');
    }
    expect(computeQuote([line({ ...base, quantity: 4 })], hn, policy, NOW).canPlaceOrder).toBe(
      true,
    );
  });

  it('OUT_OF_STOCK when availability is below the requested quantity', () => {
    const q = computeQuote([line({ quantity: 5, available: 4n })], hn, policy, NOW);
    expect(q.blockers.map((b) => b.code)).toEqual(['OUT_OF_STOCK']);
    expect(
      computeQuote([line({ quantity: 5, available: 5n })], hn, policy, NOW).canPlaceOrder,
    ).toBe(true);
  });

  it('blocks unsupported provinces and mixed storage classes', () => {
    expect(
      computeQuote([line()], { province: 'Cà Mau' }, policy, NOW).blockers.map((b) => b.code),
    ).toContain('DELIVERY_UNSUPPORTED');
    const mixed = computeQuote(
      [line(), line({ variantId: 'v2', storageClass: 'FROZEN' })],
      hn,
      policy,
      NOW,
    );
    expect(mixed.blockers.map((b) => b.code)).toContain('STORAGE_CLASS_CONFLICT');
  });

  it('UAT-07: cold-chain SKU outside the chilled region is blocked; no shipping option is invented', () => {
    const cold = line({ storageClass: 'CHILLED' });
    expect(computeQuote([cold], hn, policy, NOW).blockers.map((b) => b.code)).toContain(
      'DELIVERY_UNSUPPORTED',
    );
    const ok = computeQuote([cold], hn, { ...policy, chilledProvinces: ['Hà Nội'] }, NOW);
    expect(ok.canPlaceOrder).toBe(true);
    expect(ok.shippingFeeVnd).toBeNull();
  });

  it('empty cart is a validation blocker', () => {
    expect(computeQuote([], hn, policy, NOW).blockers[0]?.code).toBe('VALIDATION_ERROR');
  });
});

describe('SKU activation gate (ADR-0009)', () => {
  const real = {
    isTest: false,
    packLabel: 'Túi 1 kg',
    netWeightG: 1000,
    storageClass: 'DRY',
    manufacturer: 'Xưởng A',
    responsibleEntity: 'Xưởng A',
    hasCurrentCost: true,
    hasCurrentRetailPrice: true,
    hasStockRow: true,
    hasVerifiedMedia: false,
    originVerified: false,
  };
  it('a real SKU with only AI images and unverified origin is NOT ready', () => {
    const g = evaluateSkuGate(real);
    expect(g.ready).toBe(false);
    expect(
      g.items
        .filter((i) => !i.ok)
        .map((i) => i.item)
        .sort(),
    ).toEqual(['ORIGIN_VERIFIED', 'VERIFIED_MEDIA']);
  });
  it('is ready only when every item passes', () => {
    expect(evaluateSkuGate({ ...real, hasVerifiedMedia: true, originVerified: true }).ready).toBe(
      true,
    );
    expect(
      evaluateSkuGate({
        ...real,
        hasVerifiedMedia: true,
        originVerified: true,
        hasCurrentCost: false,
      }).ready,
    ).toBe(false);
    expect(
      evaluateSkuGate({ ...real, hasVerifiedMedia: true, originVerified: true, netWeightG: null })
        .ready,
    ).toBe(false);
  });
  it('TEST fixtures are exempt from media/origin only', () => {
    expect(evaluateSkuGate({ ...real, isTest: true }).ready).toBe(true);
    expect(evaluateSkuGate({ ...real, isTest: true, hasCurrentRetailPrice: false }).ready).toBe(
      false,
    );
  });
});
