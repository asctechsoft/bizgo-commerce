import type { ErrorCode } from '@bizgo/shared';

/**
 * Pure checkout-quote engine (ADR-0010). No I/O: everything it needs is passed in, so it is unit-tested
 * exhaustively. It NEVER invents a price, shipping fee or tax: undetermined inputs become blockers.
 */
export type StorageClassName = 'DRY' | 'AMBIENT' | 'CHILLED' | 'FROZEN' | 'FRAGILE';

export interface PriceRuleInput {
  minQty: number;
  unitPriceVnd: bigint;
  validFrom: Date;
  validTo: Date | null;
  priority: number;
}

export interface QuoteLineInput {
  variantId: string;
  sku: string;
  name: string;
  packLabel: string;
  netWeightG: number | null;
  storageClass: StorageClassName | null;
  variantActive: boolean;
  productActive: boolean;
  isTest: boolean;
  minQty: number;
  maxQty: number | null;
  quantityStep: number;
  quantity: number;
  rules: PriceRuleInput[];
  /** available = on_hand - reserved - quarantined in the best warehouse (0 when no stock row) */
  available: bigint;
}

export interface QuotePolicy {
  appEnv: string;
  shippingPolicy: 'BLOCK' | 'MANUAL_QUOTE';
  taxPolicy: 'UNDETERMINED' | 'INCLUSIVE' | 'EXEMPT';
  allowedProvinces: string[];
  chilledProvinces: string[];
}

export interface QuoteBlocker {
  code: ErrorCode;
  variantId?: string;
  message: string;
}

export interface QuoteLine {
  variantId: string;
  sku: string;
  name: string;
  packLabel: string;
  quantity: number;
  unitPriceVnd: bigint | null;
  lineTotalVnd: bigint | null;
}

export interface QuoteResult {
  lines: QuoteLine[];
  subtotalVnd: bigint | null;
  shippingFeeVnd: bigint | null;
  shippingNote: 'MANUAL_QUOTE' | null;
  totalVnd: bigint | null;
  canPlaceOrder: boolean;
  blockers: QuoteBlocker[];
}

/** Best matching price: highest min_qty not above `qty`, then highest priority; only rules valid at `now`. */
export function resolveUnitPrice(rules: PriceRuleInput[], qty: number, now: Date): bigint | null {
  const live = rules
    .filter((r) => r.validFrom <= now && (r.validTo === null || r.validTo > now) && r.minQty <= qty)
    .sort((a, b) => b.minQty - a.minQty || b.priority - a.priority);
  return live[0]?.unitPriceVnd ?? null;
}

export function computeQuote(
  lines: QuoteLineInput[],
  address: { province: string } | null,
  policy: QuotePolicy,
  now: Date,
): QuoteResult {
  const blockers: QuoteBlocker[] = [];
  const out: QuoteLine[] = [];
  const add = (code: ErrorCode, message: string, variantId?: string) =>
    blockers.push({ code, message, ...(variantId ? { variantId } : {}) });

  if (lines.length === 0) {
    add('VALIDATION_ERROR', 'Giỏ hàng trống.');
  }

  for (const l of lines) {
    const unit = resolveUnitPrice(l.rules, l.quantity, now);
    out.push({
      variantId: l.variantId,
      sku: l.sku,
      name: l.name,
      packLabel: l.packLabel,
      quantity: l.quantity,
      unitPriceVnd: unit,
      lineTotalVnd: unit === null ? null : unit * BigInt(l.quantity),
    });

    if (!l.variantActive || !l.productActive || (l.isTest && policy.appEnv === 'production')) {
      add('SKU_NOT_READY', `${l.name} chưa được mở bán.`, l.variantId);
      continue; // no point validating price/stock of an unsellable SKU
    }
    if (unit === null) add('PRICE_NOT_SET', `${l.name} chưa có giá bán.`, l.variantId);
    if (
      !Number.isInteger(l.quantity) ||
      l.quantity < l.minQty ||
      (l.maxQty !== null && l.quantity > l.maxQty) ||
      (l.quantity - l.minQty) % l.quantityStep !== 0
    ) {
      add('QUANTITY_INVALID', `Số lượng của ${l.name} không hợp lệ.`, l.variantId);
    } else if (l.available < BigInt(l.quantity)) {
      add('OUT_OF_STOCK', `${l.name} không đủ hàng.`, l.variantId);
    }
  }

  const classes = new Set(
    lines.map((l) => l.storageClass).filter((c): c is StorageClassName => c !== null),
  );
  if (classes.size > 1) {
    add('STORAGE_CLASS_CONFLICT', 'Giỏ hàng có nhóm bảo quản khác nhau, cần tách đơn.');
  }

  if (!address) {
    add('ADDRESS_REQUIRED', 'Vui lòng chọn địa chỉ giao hàng.');
  } else {
    if (!policy.allowedProvinces.includes(address.province)) {
      add('DELIVERY_UNSUPPORTED', 'Chưa hỗ trợ giao hàng tới khu vực này.');
    }
    const needsCold = [...classes].some((c) => c === 'CHILLED' || c === 'FROZEN');
    if (needsCold && !policy.chilledProvinces.includes(address.province)) {
      add('DELIVERY_UNSUPPORTED', 'Hàng lạnh/đông lạnh chưa được giao tới khu vực này.');
    }
  }

  if (policy.shippingPolicy === 'BLOCK') {
    add('SHIPPING_FEE_UNDETERMINED', 'Chưa xác định được phí vận chuyển.');
  }
  if (policy.taxPolicy === 'UNDETERMINED') {
    add('TAX_POLICY_UNDETERMINED', 'Chưa xác định chính sách thuế.');
  }

  const priced = out.every((l) => l.lineTotalVnd !== null) && out.length > 0;
  const subtotal = priced ? out.reduce((a, l) => a + (l.lineTotalVnd as bigint), 0n) : null;
  const canPlaceOrder = blockers.length === 0;
  return {
    lines: out,
    subtotalVnd: subtotal,
    shippingFeeVnd: null, // never fabricated: carrier pricing is blocked on D05
    shippingNote: policy.shippingPolicy === 'MANUAL_QUOTE' ? 'MANUAL_QUOTE' : null,
    totalVnd: canPlaceOrder ? subtotal : null,
    canPlaceOrder,
    blockers,
  };
}
