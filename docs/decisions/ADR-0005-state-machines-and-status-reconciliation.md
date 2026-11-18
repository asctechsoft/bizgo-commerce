# ADR-0005 — State machines and status-name reconciliation

**Status:** Proposed · **Resolves:** Gap G01–G03, G05 · **Sources:** BRD §06, Spec §08, Arch §07 · Diagrams: `docs/architecture/STATE_MACHINES.md`

## Decision

1. **BRD status names are canonical** where a BRD name exists; Spec states are added when they carry a real guard. Enums are PostgreSQL enums mirrored in `packages/shared`.
2. **No generic `PATCH status`.** Each aggregate has a `TransitionService` with an explicit table `(from, action, actor-permission, guards) → (to, side-effects)`. Invalid ⇒ `409 INVALID_STATE_TRANSITION`; guard failure ⇒ `422` with a specific code. Every transition writes `*_status_events(from,to,actor_id,reason_code,occurred_at,request_id)` + `audit_logs` + `outbox_events` in the **same transaction**, and is idempotent by `(aggregate_id, action, idempotency_key)`.
3. **Separate enums, never a single `isPaid`:** order, payment, fulfillment, shipment, reservation, quote, return, wholesale application, settlement, receivable.

## Enums

- **OrderStatus:** `DRAFT, PENDING_CONFIRMATION, CONFIRMED, PACKING, READY_TO_SHIP, PARTIALLY_SHIPPED, SHIPPED, DELIVERED, COMPLETED, ON_HOLD, CANCEL_REQUESTED, CANCELLED, RETURN_REQUESTED, RETURNED, FAILED`.
  `DRAFT` exists only for sales-created orders ("tạo đơn hộ") and holds **no stock**; customer checkout creates the order directly in `PENDING_CONFIRMATION` (quote state lives in `checkout_quotes`). Spec's `FULFILLING` is **derived** (`PACKING|READY_TO_SHIP`) from fulfillment aggregate, not stored. `COMPLETED` requires: all fulfillments `HANDED_OVER` or closed by approved adjustment, shipment `DELIVERED`, no open return/dispute, and settlement policy satisfied (`DELIVERED` ≠ paid ≠ settled).
- **PaymentStatus:** `PENDING, AWAITING_VERIFICATION, AUTHORIZED, PAID, FAILED, EXPIRED, PARTIALLY_REFUNDED, REFUNDED`. `PAID` ≡ Spec `CAPTURED`. Only server-side evidence moves a payment to `PAID`: verified bank transfer match, valid signed gateway webhook, or **COD receivable settlement**. Browser redirects / client claims never do.
- **ReceivableStatus (`kind=COD_CARRIER`):** `OUTSTANDING → PARTIALLY_SETTLED → SETTLED | WRITTEN_OFF`. Created when shipment is `DELIVERED` with COD amount; `SETTLED` via carrier remittance reconciliation (`cod_reconciliations`) ⇒ payment `PAID`. Delivered-but-unremitted stays `OUTSTANDING` and is excluded from "settled cash".
- **FulfillmentStatus:** `QUEUED, ACCEPTED, STOCK_CONFIRMED, PICKING, PACKING, PACKED, READY_FOR_HANDOVER, HANDED_OVER` + `BLOCKED, PARTIAL, REJECTED, CANCELLED`.
- **ShipmentStatus:** `DRAFT, LABELLED, PICKED_UP, IN_TRANSIT, DELIVERED, DELIVERY_FAILED, RETURN_TO_SENDER, RETURNED`.
- **ReservationStatus:** `HELD, CONSUMED, RELEASED, EXPIRED`.
- **QuoteStatus (B2B):** `REQUESTED, IN_REVIEW, OFFERED, ACCEPTED, CONVERTED_TO_ORDER, REJECTED, EXPIRED, WITHDRAWN`.
- **ReturnStatus:** `REQUESTED, UNDER_REVIEW, APPROVED, REJECTED, RECEIVED, REPLACED, REFUNDED, CLOSED`.
- **WholesaleApplicationStatus:** `SUBMITTED, UNDER_REVIEW, NEEDS_INFO, APPROVED, REJECTED`.
- **SettlementStatus:** `OPEN, RECONCILING, APPROVED, PAID, DISPUTED`.
- **ProductStatus:** `DRAFT, UNDER_REVIEW, ACTIVE, PAUSED, ARCHIVED`; **VariantStatus** same set.

## Aggregation rules

- Order `PACKING` when ≥1 fulfillment is `ACCEPTED..PACKED`; `READY_TO_SHIP` when all active fulfillments are `PACKED|READY_FOR_HANDOVER`; `PARTIALLY_SHIPPED` when some but not all fulfillment items are handed over; `SHIPPED` when all handed over. Recomputed by the Orders module on `fulfillment.*` / `shipment.*` events (idempotent).
- Cancel: `PENDING_CONFIRMATION|CONFIRMED|ON_HOLD|PACKING|READY_TO_SHIP` → `CANCELLED` releases reservations (once) and creates refund task if `PAID`. After any `HANDED_OVER` the only path is `RETURN_REQUESTED` (ADR-0004).

## Tests

Table-driven test generates every (state × action) pair and asserts allowed/denied; replay of same idempotency key yields same response; invalid transition yields 409; concurrent double-transition yields exactly one success.
