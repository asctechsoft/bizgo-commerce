# Business decision log (NOT YET APPROVED)

> Engineering never fills the "Approved answer" column. Only the owner/approver does. Full context, safe defaults and blocked scope: `docs/phase0/02_BLOCKED_DECISIONS.md`.

| ID  | Status           | Decision                                                                                                 | Approved answer | Owner | Date | Affected APIs / tests                                 |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------- | --------------- | ----- | ---- | ----------------------------------------------------- |
| D01 | BLOCKED_DECISION | Seller legal entity, invoices, payment beneficiary, supplier relationship (mua đứt bán đoạn vs đại lý)   | TBD             | TBD   | TBD  | `POST /v1/orders`, payments, settlements, legal pages |
| D02 | BLOCKED_DECISION | First 15–30 SKUs: pack conversions, photos, lot/HSD/storage, compliance; loose-weight quantity step      | TBD             | TBD   | TBD  | `POST /v1/admin/variants/:id/publish`, SKU gate tests |
| D03 | BLOCKED_DECISION | Factory location, warehouse, pickup SLA, daily cutoff                                                    | TBD             | TBD   | TBD  | warehouses, factory SLA                               |
| D04 | BLOCKED_DECISION | Costs, retail prices, B2B MOQ/tiers, discount limits, margin floor                                       | TBD             | TBD   | TBD  | pricing, `checkout/quote`, margin guard               |
| D05 | BLOCKED_DECISION | Ship zones, temperatures, carriers, fee source                                                           | TBD             | TBD   | TBD  | `checkout/quote`, shipping                            |
| D06 | BLOCKED_DECISION | COD/transfer instructions, bank verification, transfer-hold TTL, payment provider                        | TBD             | TBD   | TBD  | payments, reservation expiry                          |
| D07 | BLOCKED_DECISION | Returns/refund conditions for perishables, complaint SLA                                                 | TBD             | TBD   | TBD  | returns, refunds                                      |
| D08 | BLOCKED_DECISION | B2B approval, tax fields, deposit, receivables, credit limits                                            | TBD             | TBD   | TBD  | wholesale, quotes                                     |
| D09 | BLOCKED_DECISION | Seller identity/contact/policy/privacy/consent/data retention; legal review of TMĐT & personal-data laws | TBD             | TBD   | TBD  | content, consents, retention                          |
| D10 | BLOCKED_DECISION | Domain, hosting, secrets, backup owner, RPO/RTO                                                          | TBD             | TBD   | TBD  | infra, CI/CD                                          |
| D11 | BLOCKED_DECISION | Branding assets; AI vs verified product photos                                                           | TBD             | TBD   | TBD  | media, PDP                                            |
| D12 | BLOCKED_DECISION | Quality handling, split shipment, lot recall rules                                                       | TBD             | TBD   | TBD  | fulfillment, recall                                   |
| D13 | BLOCKED_DECISION | Does factory/handover label show COD amount?                                                             | TBD             | TBD   | TBD  | `FactoryJobResponseDTO`                               |
| D14 | BLOCKED_DECISION | Retail price VAT-inclusive or not; tax rates per group; VAT invoicing                                    | TBD             | TBD   | TBD  | quote/order tax snapshot                              |
| D15 | BLOCKED_DECISION | OTP/notification channel & provider (email/SMS/Zalo); guest verification method                          | TBD             | TBD   | TBD  | `auth/otp/*`, `orders/guest-track`                    |
| D16 | BLOCKED_DECISION | Guest checkout on/off                                                                                    | TBD             | TBD   | TBD  | cart/checkout                                         |
| D17 | BLOCKED_DECISION | Minimum/maximum order value, weight, parcel limits                                                       | TBD             | TBD   | TBD  | `checkout/quote` blockers                             |
| D18 | BLOCKED_DECISION | Definition of combo/set bundles                                                                          | TBD             | TBD   | TBD  | bundles (P1)                                          |
| D19 | BLOCKED_DECISION | Reviews: eligibility & moderation                                                                        | TBD             | TBD   | TBD  | reviews (P1)                                          |
| D20 | BLOCKED_DECISION | Privileged-account MFA method & recovery process                                                         | TBD             | TBD   | TBD  | auth, owner bootstrap                                 |

## ADR-0014 — Public catalogue shows DRAFT source items as browse-only (2026-11-19)
- Decision: the public catalogue API lists ACTIVE **and** DRAFT products (PAUSED/ARCHIVED stay hidden). Each item carries `sellable` (= ACTIVE). DRAFT items show "Chưa mở bán", expose no variants/prices, and cannot enter a cart (unchanged server gate: SKU readiness + ACTIVE variant).
- Why: the owner wants the storefront to look like the prototype with all 82 source items and their illustrative images. No SKU, price, stock or legal status is invented.
- Reverting: filter `BROWSABLE` to `['ACTIVE']` in `catalog.service.ts`.

## ADR-0015 — Order fulfilment, support threads and realtime (2026-11-19)
- Staff drive the order through confirm → pack → ready → ship (carrier + tracking required) → deliver → complete via explicit actions (transition table is the only authority). SHIP consumes stock reservations and decrements on-hand exactly once (DISPATCH ledger entry).
- COD: delivery does NOT mean paid. Staff record "COD collected" separately (only after delivery, exactly once, audited). Real COD reconciliation with the courier remains a later phase.
- Customers may cancel immediately only while PENDING_CONFIRMATION/ON_HOLD; after CONFIRMED it is a *request* staff approve/reject; later they must open a support request. Cancel reasons are a fixed whitelist; non-whitelisted staff reasons are never shown to customers.
- Support requests (customer ↔ staff thread, no refund automation, **no evidence upload yet** — needs object storage ADR).
- Realtime: Server-Sent Events carrying only "something changed" (no order data); browsers refetch authoritative state; polling fallback every 15s. The fan-out is in-process: valid for ONE API instance. Multi-instance needs Redis pub/sub (Redis unavailable in this environment).
- Not built (no backend/data): reviews/ratings, invoices, wishlist, vouchers, carrier tracking map/shipper phone, factory-side progress, online refund.
