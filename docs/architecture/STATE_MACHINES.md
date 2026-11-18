# BizGo — State machines and sequences

Canonical names and aggregation rules: ADR-0005. Every edge below = one `TransitionService` row with `(actor permission, guards, side effects)`; each emits status-event + audit + outbox in one transaction. Anything not drawn is **forbidden** (409 `INVALID_STATE_TRANSITION`).

## Order

```mermaid
stateDiagram-v2
  [*] --> DRAFT: sales creates on behalf
  [*] --> PENDING_CONFIRMATION: POST /orders (stock reserved)
  DRAFT --> PENDING_CONFIRMATION: submit (reserve)
  PENDING_CONFIRMATION --> CONFIRMED: sales/owner confirm (address, fraud, delivery policy ok)
  PENDING_CONFIRMATION --> ON_HOLD: needs info / payment mismatch
  ON_HOLD --> PENDING_CONFIRMATION: resolved
  CONFIRMED --> PACKING: factory accepts job
  PACKING --> READY_TO_SHIP: all fulfillments packed
  READY_TO_SHIP --> PARTIALLY_SHIPPED: some items handed over
  READY_TO_SHIP --> SHIPPED: all items handed over
  PARTIALLY_SHIPPED --> SHIPPED: remainder handed over
  SHIPPED --> DELIVERED: carrier proof / verified manual
  DELIVERED --> COMPLETED: fulfillment+shipment closed, no open return, settlement policy ok
  PENDING_CONFIRMATION --> CANCELLED: customer/sales (release stock once)
  CONFIRMED --> CANCEL_REQUESTED: customer after confirm
  CANCEL_REQUESTED --> CANCELLED: approved before dispatch
  CANCEL_REQUESTED --> CONFIRMED: rejected
  PACKING --> CANCELLED: owner/sales + factory ack
  DELIVERED --> RETURN_REQUESTED: return opened
  SHIPPED --> RETURN_REQUESTED: delivery refused / failed
  RETURN_REQUESTED --> RETURNED: return received + inspected
  RETURN_REQUESTED --> DELIVERED: return rejected
  PENDING_CONFIRMATION --> FAILED: unrecoverable (e.g. stock lost, quote invalid)
  CONFIRMED --> FAILED: factory shortage unresolved
  CANCELLED --> [*]
  COMPLETED --> [*]
  RETURNED --> [*]
  FAILED --> [*]
```

After the first `HANDED_OVER`, `CANCELLED` is unreachable (only `RETURN_REQUESTED`).

## Payment

```mermaid
stateDiagram-v2
  [*] --> PENDING: order created (COD or transfer chosen)
  PENDING --> AWAITING_VERIFICATION: transfer evidence submitted
  PENDING --> AUTHORIZED: gateway authorised (P5)
  AWAITING_VERIFICATION --> PAID: accountant matches amount/ref (idempotent)
  AWAITING_VERIFICATION --> FAILED: rejected
  AUTHORIZED --> PAID: capture webhook (signed, amount match)
  PENDING --> PAID: COD receivable settled via carrier remittance
  PENDING --> EXPIRED: transfer-hold TTL reached
  PENDING --> FAILED: cancelled
  PAID --> PARTIALLY_REFUNDED: refund < paid
  PAID --> REFUNDED: refund == paid
  PARTIALLY_REFUNDED --> REFUNDED: remaining refunded
```

Wrong-amount webhook ⇒ event stored `QUARANTINED`, payment unchanged, alert raised. Duplicate provider event id ⇒ ignored (unique key).

## COD receivable

```mermaid
stateDiagram-v2
  [*] --> OUTSTANDING: shipment DELIVERED with COD amount
  OUTSTANDING --> PARTIALLY_SETTLED: partial carrier remittance
  PARTIALLY_SETTLED --> SETTLED: remainder remitted
  OUTSTANDING --> SETTLED: full remittance matched
  OUTSTANDING --> WRITTEN_OFF: lost/disputed, owner+accountant approval
```

## Fulfillment (factory job)

```mermaid
stateDiagram-v2
  [*] --> QUEUED: order CONFIRMED + assign-factory
  QUEUED --> ACCEPTED: FM accept
  QUEUED --> REJECTED: FM reject (reason)
  ACCEPTED --> STOCK_CONFIRMED: stock & lot check ok
  ACCEPTED --> BLOCKED: shortage/quality hold/lot expired (reason + evidence)
  STOCK_CONFIRMED --> PICKING
  PICKING --> PACKING: all lines picked (FEFO lots valid)
  PICKING --> PARTIAL: partial pick, rest blocked
  PACKING --> PACKED: parcels, weights, photos saved
  PACKED --> READY_FOR_HANDOVER: label printed
  READY_FOR_HANDOVER --> HANDED_OVER: carrier handover (consumes reservation + dispatch ledger, once)
  PARTIAL --> PACKING: remaining available
  BLOCKED --> ACCEPTED: sales resolved (wait / split / cancel path)
  QUEUED --> CANCELLED: order cancelled
  ACCEPTED --> CANCELLED: order cancelled
```

Factory never swaps SKU; shortage ⇒ `BLOCKED` ⇒ sales presents customer choices (wait / substitute with explicit acceptance / split shipment / cancel+refund). Price changes need customer acknowledgement.

## Shipment

```mermaid
stateDiagram-v2
  [*] --> DRAFT: admin creates (manual MVP)
  DRAFT --> LABELLED: carrier + tracking entered
  LABELLED --> PICKED_UP
  PICKED_UP --> IN_TRANSIT
  IN_TRANSIT --> DELIVERED: proof/verified manual
  IN_TRANSIT --> DELIVERY_FAILED
  DELIVERY_FAILED --> IN_TRANSIT: retry
  DELIVERY_FAILED --> RETURN_TO_SENDER
  RETURN_TO_SENDER --> RETURNED
```

## Reservation

`HELD → CONSUMED` (dispatch) · `HELD → RELEASED` (cancel) · `HELD → EXPIRED` (transfer TTL). Terminal states immutable; each change guarded by `WHERE status='HELD'` (rowCount = 1).

## Quote (B2B), Return, Wholesale application, Settlement

```mermaid
stateDiagram-v2
  direction LR
  state "Quote" as Q {
    [*] --> REQUESTED
    REQUESTED --> IN_REVIEW
    IN_REVIEW --> OFFERED: sale approves (limits)
    OFFERED --> ACCEPTED: customer, before expiry
    ACCEPTED --> CONVERTED_TO_ORDER
    OFFERED --> EXPIRED
    REQUESTED --> WITHDRAWN
    IN_REVIEW --> REJECTED
  }
```

```mermaid
stateDiagram-v2
  direction LR
  state "Return" as R {
    [*] --> REQUESTED
    REQUESTED --> UNDER_REVIEW
    UNDER_REVIEW --> APPROVED
    UNDER_REVIEW --> REJECTED
    APPROVED --> RECEIVED
    APPROVED --> REPLACED
    APPROVED --> REFUNDED
    RECEIVED --> REFUNDED
    RECEIVED --> CLOSED
    REPLACED --> CLOSED
    REFUNDED --> CLOSED
    REJECTED --> CLOSED
  }
```

```mermaid
stateDiagram-v2
  direction LR
  state "Wholesale application" as W {
    [*] --> SUBMITTED
    SUBMITTED --> UNDER_REVIEW
    UNDER_REVIEW --> NEEDS_INFO
    NEEDS_INFO --> UNDER_REVIEW: customer responds
    UNDER_REVIEW --> APPROVED: owner/sales(+tier)
    UNDER_REVIEW --> REJECTED: reason visible
    REJECTED --> SUBMITTED: reapply
  }
```

Settlement: `OPEN → RECONCILING → APPROVED → PAID`, `RECONCILING|APPROVED → DISPUTED → RECONCILING`. Restock after return only from `RECEIVED` after quality inspection.

## Sequence — checkout → order → fulfillment → cash (FLOW A)

```mermaid
sequenceDiagram
  autonumber
  participant C as Customer web
  participant API as API (Checkout/Orders)
  participant DB as PostgreSQL
  participant W as Worker
  participant S as Sales (admin)
  participant F as Factory
  C->>API: POST /checkout/quote {items, address}
  API->>DB: price + availability + eligibility (read)
  API-->>C: quote{id,version,expiresAt,blockers[]}
  C->>API: POST /orders (Idempotency-Key, quoteId, version)
  API->>DB: BEGIN; idempotency insert; re-price; reserve (conditional UPDATE per variant ASC)
  API->>DB: insert order+items+financials+payment(PENDING)+events+outbox; COMMIT
  API-->>C: 201 {orderNumber, PENDING_CONFIRMATION}
  W->>DB: poll outbox (SKIP LOCKED) -> notify BizGo
  S->>API: POST /admin/orders/:id/confirm, /assign-factory
  F->>API: accept -> stock-confirm -> pick (FEFO) -> pack(+evidence) -> handover
  API->>DB: HANDED_OVER: reservation CONSUMED, on_hand--, ledger DISPATCH (once)
  S->>API: POST /admin/shipments {carrier, tracking} (manual)
  S->>API: mark DELIVERED -> receivable OUTSTANDING (COD)
  S->>API: COD reconciliation -> receivable SETTLED -> payment PAID
  API->>DB: settlement + actual margin (expected snapshot unchanged)
```
