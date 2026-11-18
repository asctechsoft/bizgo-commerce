# BizGo implementation checklist (check only after tests pass)

## Phase 0: architecture and approval
- [x] Read 2 original DOCX and source catalogue, inspect HTML demo — `docs/phase0/01_GAP_REPORT.md`
- [x] Create source gap report + all BLOCKED_DECISION tickets — `docs/phase0/02_BLOCKED_DECISIONS.md` (D01–D20), `docs/decisions/DECISION_LOG.md`
- [x] Write ADRs for stack, auth, money and inventory hold, API response, background jobs — `docs/decisions/ADR-0001…0014`
- [x] Draw ERD, migration strategy, permission matrix, status transitions — `docs/architecture/{ERD_AND_SCHEMA_PLAN,PERMISSION_MATRIX,STATE_MACHINES}.md`
- [ ] OpenAPI spec — **skeleton written** (`docs/api/openapi.skeleton.yaml`, 143 operations) but YAML/OpenAPI validity **not yet machine-checked** (no parser available offline; to be validated in P1-10)
- [x] Verify server-side B2B and factory DTO isolation by design — ADR-0008 (design only; enforcement tests in P1-08/P3-02)

## Phase 1: foundation, catalog, storefront
- [x] pnpm monorepo / Next.js storefront and backoffice / NestJS API and worker (`web/`, `backend/`, `packages/`; report: `docs/phase1/PHASE1_REPORT_VI.md`)
- [ ] Docker Compose Postgres/Redis/media-dev and `.env.example`; private networks — files written, `.env.example` done, **compose NOT RUN (Docker unavailable)**
- [x] Prisma migration, 8 categories and 82 DRAFT products imported from CSV
- [x] Auth/session/OTP security + resource-scoped RBAC + audit log (OTP delivery blocked on D15: fail-closed)
- [x] Public category/product/variant API, error/pagination, OpenAPI (variants arrive with Phase 2 SKU gate; products/categories done)
- [x] Rebuild HTML prototype header, hero, category, PDP and mobile menu with genuine API
- [ ] Accessibility, responsive QA and search; SEO for approved public pages — no horizontal overflow verified at 320–1024 px, search and sitemap done; **axe, 1280–1920 px, 200% zoom and Playwright NOT RUN**

## Phase 2: transaction-safe commerce
- [ ] SKU activation with verified pack/price/cost/stock/lot/region requirements
- [ ] Retail/wholesale price rules and quote calculation
- [ ] Authenticated/guest cart and merge; checkout quote with version+TTL
- [ ] Atomic reservation with PostgreSQL and rollback; hold expiry worker
- [ ] Idempotent order creation and immutable snapshots/events/outbox
- [ ] Customer order history and verified guest tracking
- [ ] Admin order queue/confirm/cancel with audit
- [ ] E2E test last stock concurrency; price change; double-click

## Phase 3: fulfillment and delivery
- [ ] Factory assigned queue and secure job detail DTO
- [ ] Stock confirm, FEFO lot pick, packing quantity/evidence, exception reason
- [ ] Partial/complete job and shipping manual tracking
- [ ] Stock dispatch ledger exactly once; cancel/release jobs
- [ ] Public tracking timeline and notifications via BullMQ
- [ ] E2E customer→admin→factory→carrier including shortage

## Phase 4: money, after-sales, release
- [ ] Verified bank transfer matching and secure COD tracking
- [ ] Settlement, supplier payable, expected vs actual margin
- [ ] Return/complaint with file evidence, review, refund and inventory correction
- [ ] Approved legal policy, seller contact, privacy/account deletion paths
- [ ] Admin reports, content, monitoring, audit, CI/CD, backups/restoration
- [ ] Staging security tests, accessibility, load/SEO, operational UAT and release gates

## Phase 5: B2B and automation
- [ ] Application review/role/tier/organization scopes
- [ ] MOQ/quote workflow, approval, quote expiration and conversion to order
- [ ] Reorder/partial deliveries and receivables if approved
- [ ] Approved payment and shipping provider adapters, signed webhooks/reconcile

## Phase 6: Flutter app
- [ ] OpenAPI-generated mobile client with consistent backend contract
- [ ] Native account/catalog/cart/checkout/orders/notifications
- [ ] Android/iOS QA, privacy/permissions, store release

## Universal acceptance
- [ ] No imaginary prices, packs, stock, seller, compliance or ship costs
- [ ] No admin/factory/customer cross-tenant resource leak
- [ ] Every mutation has validation; sensitive ones have idempotency/audit
- [ ] Happy and unhappy cases covered by tests; dev demo never masquerades as production
