import type { OrderStatus } from './enums';

/**
 * Customer-facing grouping of order statuses (tabs / counters) and the cancel-reason whitelist.
 * Shared by the API (filters, summary counts, DTO sanitising) and the web apps (labels, steppers).
 */
export const ORDER_GROUPS = [
  'pending',
  'confirmed',
  'preparing',
  'shipping',
  'delivered',
  'cancelled',
  'other',
] as const;
export type OrderGroup = (typeof ORDER_GROUPS)[number];

export const ORDER_GROUP_STATUSES: Record<OrderGroup, readonly OrderStatus[]> = {
  pending: ['PENDING_CONFIRMATION', 'ON_HOLD'],
  confirmed: ['CONFIRMED', 'CANCEL_REQUESTED'],
  preparing: ['PACKING', 'READY_TO_SHIP'],
  shipping: ['SHIPPED', 'PARTIALLY_SHIPPED'],
  delivered: ['DELIVERED', 'COMPLETED'],
  cancelled: ['CANCELLED'],
  other: ['RETURN_REQUESTED', 'RETURNED', 'FAILED', 'DRAFT'],
};

export function orderGroupOf(status: OrderStatus): OrderGroup {
  for (const g of ORDER_GROUPS) if (ORDER_GROUP_STATUSES[g].includes(status)) return g;
  return 'other';
}

/** Reasons a customer may pick when cancelling (the free-text reason is intentionally not supported). */
export const CUSTOMER_CANCEL_REASONS = [
  'CUSTOMER_REQUEST',
  'CHANGED_MIND',
  'WRONG_ADDRESS',
  'FOUND_BETTER_PRICE',
  'ORDERED_BY_MISTAKE',
  'OTHER',
] as const;
export type CustomerCancelReason = (typeof CUSTOMER_CANCEL_REASONS)[number];

/** Staff reasons that are safe to show to the customer; anything else stays internal (audit only). */
export const STAFF_CANCEL_REASONS = [
  'OUT_OF_STOCK',
  'CUSTOMER_UNREACHABLE',
  'DELIVERY_UNSUPPORTED',
  'OTHER',
] as const;

export const PUBLIC_CANCEL_REASONS: readonly string[] = [
  ...CUSTOMER_CANCEL_REASONS,
  ...STAFF_CANCEL_REASONS,
];

export const SUPPORT_TYPES = [
  'WRONG_ITEM',
  'MISSING_ITEM',
  'DAMAGED',
  'RETURN_EXCHANGE',
  'OTHER',
] as const;
export type SupportTypeCode = (typeof SUPPORT_TYPES)[number];

export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type SupportStatusCode = (typeof SUPPORT_STATUSES)[number];
