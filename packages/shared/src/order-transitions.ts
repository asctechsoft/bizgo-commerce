import type { OrderStatus } from './enums';

/**
 * Order transition table (ADR-0005, docs/architecture/STATE_MACHINES.md).
 * There is no generic "set status": every edge has an action name; anything not listed is forbidden.
 * Fulfillment/shipping edges are included now so the table is authoritative; the API exposes them in
 * the phases that implement the matching workflows.
 */
export type OrderAction =
  | 'SUBMIT'
  | 'CONFIRM'
  | 'HOLD'
  | 'RESUME'
  | 'START_PACKING'
  | 'MARK_READY'
  | 'PARTIAL_SHIP'
  | 'SHIP'
  | 'DELIVER'
  | 'COMPLETE'
  | 'REQUEST_CANCEL'
  | 'APPROVE_CANCEL'
  | 'REJECT_CANCEL'
  | 'CANCEL'
  | 'REQUEST_RETURN'
  | 'REJECT_RETURN'
  | 'RECEIVE_RETURN'
  | 'FAIL';

export interface OrderEdge {
  from: OrderStatus;
  action: OrderAction;
  to: OrderStatus;
}

export const ORDER_EDGES: readonly OrderEdge[] = [
  { from: 'DRAFT', action: 'SUBMIT', to: 'PENDING_CONFIRMATION' },
  { from: 'PENDING_CONFIRMATION', action: 'CONFIRM', to: 'CONFIRMED' },
  { from: 'PENDING_CONFIRMATION', action: 'HOLD', to: 'ON_HOLD' },
  { from: 'CONFIRMED', action: 'HOLD', to: 'ON_HOLD' },
  { from: 'ON_HOLD', action: 'RESUME', to: 'PENDING_CONFIRMATION' },
  { from: 'CONFIRMED', action: 'START_PACKING', to: 'PACKING' },
  { from: 'PACKING', action: 'MARK_READY', to: 'READY_TO_SHIP' },
  { from: 'READY_TO_SHIP', action: 'PARTIAL_SHIP', to: 'PARTIALLY_SHIPPED' },
  { from: 'READY_TO_SHIP', action: 'SHIP', to: 'SHIPPED' },
  { from: 'PARTIALLY_SHIPPED', action: 'SHIP', to: 'SHIPPED' },
  { from: 'SHIPPED', action: 'DELIVER', to: 'DELIVERED' },
  { from: 'DELIVERED', action: 'COMPLETE', to: 'COMPLETED' },
  // cancellation (only before any hand-over; afterwards the return workflow applies)
  { from: 'PENDING_CONFIRMATION', action: 'CANCEL', to: 'CANCELLED' },
  { from: 'ON_HOLD', action: 'CANCEL', to: 'CANCELLED' },
  { from: 'CONFIRMED', action: 'REQUEST_CANCEL', to: 'CANCEL_REQUESTED' },
  { from: 'CONFIRMED', action: 'CANCEL', to: 'CANCELLED' },
  { from: 'PACKING', action: 'CANCEL', to: 'CANCELLED' },
  { from: 'READY_TO_SHIP', action: 'CANCEL', to: 'CANCELLED' },
  { from: 'CANCEL_REQUESTED', action: 'APPROVE_CANCEL', to: 'CANCELLED' },
  { from: 'CANCEL_REQUESTED', action: 'REJECT_CANCEL', to: 'CONFIRMED' },
  // returns
  { from: 'DELIVERED', action: 'REQUEST_RETURN', to: 'RETURN_REQUESTED' },
  { from: 'SHIPPED', action: 'REQUEST_RETURN', to: 'RETURN_REQUESTED' },
  { from: 'RETURN_REQUESTED', action: 'RECEIVE_RETURN', to: 'RETURNED' },
  { from: 'RETURN_REQUESTED', action: 'REJECT_RETURN', to: 'DELIVERED' },
  // unrecoverable
  { from: 'PENDING_CONFIRMATION', action: 'FAIL', to: 'FAILED' },
  { from: 'CONFIRMED', action: 'FAIL', to: 'FAILED' },
];

/** Statuses from which a cancellation releases stock reservations (nothing handed over yet). */
export const CANCELLABLE_BEFORE_DISPATCH: readonly OrderStatus[] = [
  'PENDING_CONFIRMATION',
  'ON_HOLD',
  'CONFIRMED',
  'PACKING',
  'READY_TO_SHIP',
  'CANCEL_REQUESTED',
];

export function nextOrderStatus(from: OrderStatus, action: OrderAction): OrderStatus | null {
  return ORDER_EDGES.find((e) => e.from === from && e.action === action)?.to ?? null;
}

export function allowedOrderActions(from: OrderStatus): OrderAction[] {
  return ORDER_EDGES.filter((e) => e.from === from).map((e) => e.action);
}
