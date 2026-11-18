/**
 * Canonical status enums (ADR-0005). Names follow the BRD where a BRD name exists.
 * These mirror the PostgreSQL enums in prisma/schema.prisma.
 */
export const ORDER_STATUSES = [
  'DRAFT',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PACKING',
  'READY_TO_SHIP',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'ON_HOLD',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'FAILED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'AWAITING_VERIFICATION',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'EXPIRED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'UNDER_REVIEW', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ORIGIN_TYPES = [
  'UNVERIFIED',
  'FACTORY_MADE',
  'FACTORY_PACKED',
  'FACTORY_DISTRIBUTED',
  'INTERNAL_SUPPLY',
] as const;
export type OriginType = (typeof ORIGIN_TYPES)[number];

export const SESSION_REALMS = ['CUSTOMER', 'ADMIN', 'FACTORY'] as const;
export type SessionRealm = (typeof SESSION_REALMS)[number];

export const ROLE_CODES = [
  'OWNER',
  'SALES_CS',
  'ACCOUNTANT',
  'WAREHOUSE',
  'FACTORY_MANAGER',
  'FACTORY_STAFF',
  'CUSTOMER',
  'WHOLESALE_CUSTOMER',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

/** Which realm each role may sign into. */
export const ROLE_REALM: Record<RoleCode, SessionRealm> = {
  OWNER: 'ADMIN',
  SALES_CS: 'ADMIN',
  ACCOUNTANT: 'ADMIN',
  WAREHOUSE: 'ADMIN',
  FACTORY_MANAGER: 'FACTORY',
  FACTORY_STAFF: 'FACTORY',
  CUSTOMER: 'CUSTOMER',
  WHOLESALE_CUSTOMER: 'CUSTOMER',
};

/** Roles that must use MFA (ADR-0002, D20). */
export const MFA_REQUIRED_ROLES: readonly RoleCode[] = ['OWNER', 'ACCOUNTANT'];
