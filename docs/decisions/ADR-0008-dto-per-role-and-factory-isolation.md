# ADR-0008 — DTO-per-role, factory isolation, B2B tenant isolation

**Status:** Proposed · **Sources:** Spec §03/§10.5, Arch §03/§6.2, BRD §02 · **Open:** D13 · Satisfies TODO Phase 0 item "Verify server-side B2B and factory DTO isolation by design"

## Decision

1. **Never serialize Prisma entities.** Controllers return only DTO classes produced by explicit mapper functions (`toFactoryJobDto(entity)`), with response `ClassSerializerInterceptor` + `excludeExtraneousValues`. A lint rule bans returning `PrismaClient` results from controllers.
2. **Separate controller trees and modules** per audience: `public/*`, `me/*` (customer), `admin/*`, `factory/*`. The factory module's repository only selects an **allowlisted column set** from `fulfillments`, `fulfillment_items`, `variants` (sku, display name, pack label, storage class), `inventory_lots`, packaging evidence, and a **minimal ship-to label view** (receiver name, phone, address) exposed only in states `PACKING..HANDED_OVER`.
3. **`FactoryJobResponseDTO` allowlist:** `jobCode, orderRef(public short ref), status, slaDueAt, storageClass, items[{sku, displayName, packLabel, quantity, notes}], lotPicks[{lotCode, expiresAt, qty}], packagingNotes, parcels[], shipLabel{receiverName, phone, addressLines} (need-to-know), exceptions[]`. **Forbidden anywhere in factory responses:** retail/tier price, discount, promo, order totals, payment status/amount (until D13), supplier cost, margin, customer email/history, other factories' jobs.
4. **Defence in depth**
   - DB: factory read model implemented as dedicated **PostgreSQL views** (`factory_job_v`, `factory_job_item_v`) selected by a restricted DB role `bizgo_factory_ro` used by the factory repository connection pool, so even a coding mistake cannot join price tables (role lacks grants). Money tables (`order_financials`, `supplier_costs`, `payments`, `settlements`) are not granted to that role.
   - API: guard resolves `factory_id` from the user's `factory_assignments`; every query includes `WHERE factory_id = :actorFactory`. Cross-factory id ⇒ 404.
   - Test: recursive **JSON key scan** on all `/v1/factory/**` responses (fixtures with non-zero prices/costs) asserting none of the forbidden keys (`price`, `cost`, `margin`, `discount`, `total`, `payment`, `email`…) appear, plus calls to `/v1/admin/**` with a factory token ⇒ 403, with assertions on body keys.
5. **Customer/B2B isolation:** every `me/*` query is scoped by `customer_id`/`organization_id` from the session (never from the request). Tier pricing (`GET /v1/pricing/tiers/me`, quote lines) resolves `price_list` from the actor's **approved** `organization_members` row; requesting another org's tier id ⇒ 404; unapproved/pending applicants get retail prices only. Public endpoints never join `supplier_costs`; the cost table is only reachable from `admin/costs` (permission `cost:read`).
6. **Guest access** to an order requires `orderNumber` + verified contact (OTP) → short-lived signed `orderViewToken` bound to order id and contact hash.
7. **PII separation:** `pii:read` permission gates customer phone/email/address in admin lists (masked by default); factory sees only the ship-label view.

## Consequences

More mappers/views to maintain, but leaks require breaking three independent layers (DTO allowlist, DB role, scope predicate).
