# ADR-0004 — Inventory ledger, reservations, concurrency

**Status:** Proposed · **Sources:** Spec §05 inv.2, §11 pseudocode, Arch §4.1, BRD §08 · **Open:** D03, D06, D12

## Model

- `inventory_balances (warehouse_id, variant_id)` PK: `on_hand`, `reserved`, `quarantined` (all `BIGINT ≥ 0`), `version`. DB `CHECK (on_hand >= 0 AND reserved >= 0 AND quarantined >= 0 AND on_hand >= reserved + quarantined)`.
- `stock_movements` append-only ledger (`type`: RECEIPT, ADJUST_PLUS, ADJUST_MINUS, RESERVE, RELEASE, DISPATCH, RETURN_RESTOCK, QUARANTINE_IN/OUT, COUNT_CORRECTION; `qty`, `reason_code`, `actor_id`, `ref_type/ref_id`, `occurred_at`, `idempotency_key UNIQUE NULLS`). Balances are a materialised result of ledger writes made **in the same transaction**; a nightly job re-derives and alerts on drift.
- `inventory_lots (lot_code, variant_id, warehouse_id, manufactured_at, expires_at, qty_on_hand, qty_quarantined, status, recall_case_id)`. Reservation is at **balance level**; lot allocation happens at pick (FEFO, expiry/quality checked) — so a reservation never promises a lot.
- `inventory_reservations (order_id, order_item_id, warehouse_id, variant_id, qty, status HELD|CONSUMED|RELEASED|EXPIRED, expires_at NULL, version)`.
- **Available = on_hand − reserved − quarantined** (Arch §4.1).

## Reserve (inside the order-create transaction, ADR-0006)

```sql
-- items iterated in deterministic order (variant_id ASC) to avoid deadlocks
UPDATE inventory_balances
   SET reserved = reserved + $qty, version = version + 1
 WHERE warehouse_id = $w AND variant_id = $v
   AND on_hand - reserved - quarantined >= $qty;
-- rowCount must be 1, else ROLLBACK + OUT_OF_STOCK
```

The conditional single-statement UPDATE is the lock; no read-then-write. Isolation `READ COMMITTED` suffices; `SERIALIZABLE` retried only for allocation across multiple warehouses (not in MVP: **one warehouse per order line**, split-warehouse allocation is out of scope until D03/D12).

## Dispatch / release

- **Dispatch** (factory handover or approved transfer): one transaction: `on_hand -= qty`, `reserved -= qty`, reservation `HELD→CONSUMED` (guard `WHERE status='HELD'`, rowCount must be 1 ⇒ exactly once), ledger `DISPATCH`, lot qty decrement.
- **Cancel before dispatch / expiry**: `reserved -= qty`, reservation `HELD→RELEASED|EXPIRED` with the same `WHERE status='HELD'` guard; expiry job selects with `FOR UPDATE SKIP LOCKED`, so it cannot release after dispatch and two workers cannot double-release.
- **Expiry TTL** applies only to orders awaiting transfer verification (`TRANSFER_HOLD_TTL_MINUTES`, value = D06). COD and confirmed orders hold until cancel/dispatch.
- After handover, cancellation is the **return workflow** (restock only after quality inspection).

## Rules

- No artificial positive stock; shortage ⇒ `OUT_OF_STOCK` or manual quote. Negative adjustments that would break the CHECK are rejected with `INSUFFICIENT_STOCK`.
- Quarantine/recall: `QUARANTINE_IN` moves available → quarantined atomically; lot recall query lists delivered `order_items` by `lot_id` (BRD §08).
- Every inventory write: audit row + outbox event in the same transaction.

## Tests (real PostgreSQL only)

2 concurrent buyers/stock 1 ⇒ 1 order; N parallel buyers/stock K ⇒ exactly K; cancel+dispatch race ⇒ single release/consume; expiry vs. verify race; ledger/balance drift check; deadlock-free multi-item carts.
