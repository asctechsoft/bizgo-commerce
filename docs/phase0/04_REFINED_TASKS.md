# BizGo — Refined task backlog (Phase 0 output)

Refines `docs/IMPLEMENTATION_TODO.md` into dependency-ordered, testable tasks. IDs: `P<phase>-<nn>`. "Done" = code + tests + docs exist and were run (actual output quoted in the phase report). `BLK` = depends on a BLOCKED_DECISION (work proceeds fail-closed). UAT IDs map to Spec §12 cases 1–18.

## Phase 1 — Foundation, catalog read, storefront shell

Goal: a running system that shows the **82 DRAFT products honestly** (not purchasable), with secure auth foundations and no demo logic.

| ID    | Task                                                                                                                                                                                                          | Depends     | Done criteria                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | pnpm workspace skeleton (`web/*`, `backend/*`, `mobile/`, `packages/*`, `prisma/`, `infra/`), TS strict base config, ESLint/Prettier, `.editorconfig`, `.gitignore`, `.env.example` (dummy values), Node engines                     | –           | `pnpm -r typecheck`, `lint` pass on empty packages                                                                                                          |
| P1-02 | `packages/shared`: `money` (BigInt helpers, allocate), `units` (weight conversion, non-convertible guard), error codes, enums (ADR-0005), permission codes                                                    | P1-01       | Vitest unit tests incl. rounding allocation sums exactly, `INVALID_PACK_CONVERSION` for `bao/bì/túi…`                                                       |
| P1-03 | Prisma schema M001 (ERD §1–§2 P1 tables, enums, extensions, CHECK/triggers/roles in raw SQL)                                                                                                                  | P1-01       | `prisma validate`, migrate-from-scratch on real PostgreSQL succeeds; immutable `source_*` trigger test                                                      |
| P1-04 | Seed: categories(8) + products(82 DRAFT) from `docs/catalog_source_82.csv`, aliases, illustrative media rows; test-fixture seed behind flag                                                                   | P1-03       | Seed twice ⇒ identical; asserts 82/8/per-category counts, all DRAFT/UNVERIFIED, no variants/prices/stock; production guard test                             |
| P1-05 | NestJS API bootstrap: config validation (zod), request-id, logger, exception filter (`{code,message,details,requestId}`), validation pipe, helmet/CORS, Swagger, `/health/*`, rate-limit module               | P1-01       | e2e: error envelope shape, request-id echo, health ready checks DB                                                                                          |
| P1-06 | Audit + outbox + idempotency infrastructure (tables, services, interceptor), worker app skeleton with outbox publisher                                                                                        | P1-03,05    | integration tests on real PG: outbox written in same tx; rollback leaves none; idempotency replay/conflict                                                  |
| P1-07 | Auth: register, login, refresh rotation + reuse detection, logout, password change/forgot/reset, OTP (CSPRNG, TTL, attempts, cooldown, dev console transport only under flag), Argon2id, sessions realm, CSRF | P1-05,06    | UAT-15 tests: brute-force lockout, reset token one-use, logout revokes, no fixed OTP, `503 OTP_DELIVERY_NOT_CONFIGURED` in prod config                      |
| P1-08 | RBAC: roles/permissions seed, guards, resource-scope helpers, owner bootstrap CLI, MFA (TOTP) for OWNER/ACCOUNTANT, generated permission-matrix test harness                                                  | P1-07       | matrix test green for implemented endpoints; MFA required to log in as OWNER                                                                                |
| P1-09 | Public catalog API: `GET /v1/categories`, `/products` (search/sort/page/limit), `/products/:slug`; ACTIVE-only policy (so currently empty public listing!) + admin read endpoints for DRAFT                   | P1-04,05,08 | tests: public list excludes DRAFT; admin list shows 82; pagination/sort whitelist; trigram+unaccent search over aliases; OpenAPI emitted & committed        |
| P1-10 | `packages/contracts` generated client; OpenAPI drift check                                                                                                                                                    | P1-09       | CI script fails on drift                                                                                                                                    |
| P1-11 | `packages/ui-web` tokens + primitives; Storefront shell (Header/Nav/Footer/mobile bottom bar/Hero/Benefits/Category grid) bound to API with loading/empty/error states, `vi` message catalog                  | P1-09,10    | Playwright: 9-viewport screenshots, no horizontal scroll, axe clean; home renders categories from API; empty ACTIVE catalog shows honest "Sắp mở bán" state |
| P1-12 | Backoffice shell: `/admin/login`, `/admin` layout, **Admin catalog (read-only list of 82 drafts + detail)**, `/factory/login` shell; realm separation                                                         | P1-08,09    | login with MFA works against real API; factory token rejected on admin routes                                                                               |
| P1-13 | Docker Compose (Postgres, Redis, MinIO, Mailpit, api, worker, 2 web), healthchecks, private network, `infra/docker/*.Dockerfile`                                                                              | P1-05       | `docker compose config` valid (**run requires Docker — NOT RUN here, see E01**)                                                                             |
| P1-14 | CI workflow (lint, typecheck, unit, integration w/ service containers, OpenAPI drift, secret scan) + README (Windows instructions)                                                                            | all         | workflow file lints; local equivalent commands pass                                                                                                         |

Phase 1 explicitly does **not** include: variants, prices, cart, checkout, stock (Phase 2).

## Phase 2 — Transaction-safe commerce (BLK: D01, D02, D04, D05, D14, D17 for real SKUs; test fixtures meanwhile)

P2-01 variants/unit conversions/SKU readiness gate + publish API (UAT SKU_NOT_READY) · P2-02 price lists/rules (exclusion constraint) + supplier costs (cost:read) · P2-03 warehouses/balances/ledger/adjustments (ADR-0004) · P2-04 pricing engine + `/checkout/quote` (blockers, TTL, versioning) · P2-05 cart (guest session + merge) · P2-06 `POST /orders` (idempotent, reserve, snapshots, outbox) **UAT-01, 02, 03** · P2-07 customer orders + verified guest tracking (**UAT-05**) · P2-08 admin order queue/confirm/cancel/hold + stock release exactly once (**UAT-08 part**) · P2-09 storefront: catalog filters, PDP, cart, checkout, success, account orders · P2-10 admin: SKU readiness UI, prices/costs/inventory screens · P2-11 contact/support/quote request forms backed by real endpoints · E2E (test SKUs).

## Phase 3 — Fulfillment (BLK: D03, D12, D13)

P3-01 factories/assignments/lots/quality holds · P3-02 factory DTO + views + restricted DB role (**UAT-06**) · P3-03 accept/stock-confirm/FEFO pick/pack/evidence/handover (**UAT-09, 10**) · P3-04 manual shipment + tracking timeline · P3-05 dispatch ledger exactly once, cancel/release (**UAT-08**) · P3-06 notifications via outbox/BullMQ · P3-07 shortage/exception flow (FLOW C) · P3-08 storefront tracking + admin fulfillment screens + factory portal screens · E2E customer→admin→factory→carrier.

## Phase 4 — Money, after-sales, release (BLK: D01, D06, D07, D09, D10)

P4-01 bank-transfer verification + hold TTL expiry job · P4-02 COD receivable + carrier reconciliation (**UAT-11**) · P4-03 supplier settlement + expected/actual margin (**UAT-12**) · P4-04 returns/complaints/refunds with private evidence (**UAT-14**) · P4-05 webhook framework: signature/replay/quarantine (**UAT-04**, provider adapters later) · P4-06 policies/content CMS + SEO (sitemap/robots/JSON-LD) · P4-07 reports/KPIs · P4-08 monitoring, backup/restore drill (**UAT-17**), staging safety (**UAT-18**), responsive/a11y gates (**UAT-16**), go-live checklist.

## Phase 5 — B2B & integrations (BLK: D08, D18, D19)

P5-01 wholesale application/approval/org+tier (**UAT-05 org part, UAT-13**) · P5-02 tier pricing + MOQ + quotes + expiry + conversion · P5-03 reorder/partial delivery/receivables (if approved) · P5-04 carrier + payment adapters per signed contracts · P5-05 bundles/reviews if D18/D19.

## Phase 6 — Flutter app

OpenAPI-generated Dart client; native auth/catalog/cart/checkout/orders/notifications; store readiness.

## UAT ↔ test ID map

| UAT    | Spec §12 case                                                               | Phase                    |
| ------ | --------------------------------------------------------------------------- | ------------------------ |
| UAT-01 | Two buyers, last unit                                                       | 2                        |
| UAT-02 | Price change in open cart ⇒ `PRICE_CHANGED`                                 | 2                        |
| UAT-03 | Double-click/retry ⇒ one order                                              | 2                        |
| UAT-04 | Webhook replay / wrong amount                                               | 4                        |
| UAT-05 | Cross-customer / cross-org denial                                           | 2 (customer), 5 (org)    |
| UAT-06 | Factory cannot see cost/margin                                              | 3                        |
| UAT-07 | Cold-chain outside region blocked                                           | 2/3                      |
| UAT-08 | Cancel releases once; after handover ⇒ return flow                          | 2/3                      |
| UAT-09 | Partial pick/pack tracking                                                  | 3                        |
| UAT-10 | Expired/quarantined lot not pickable; recall trace                          | 3                        |
| UAT-11 | COD delivered ≠ remitted                                                    | 4                        |
| UAT-12 | Historical margin unchanged by price change                                 | 2/4                      |
| UAT-13 | Quote expiry/limits/unapproved wholesale                                    | 5                        |
| UAT-14 | Refund needs proof/permission; audited                                      | 4                        |
| UAT-15 | OTP brute force, reset one-use, logout revoke, MFA                          | **1**                    |
| UAT-16 | 320…1920 viewport QA, keyboard/SR smoke                                     | **1** onward, each phase |
| UAT-17 | Restore backup to isolated staging                                          | 4                        |
| UAT-18 | Staging cannot send real payment/notification; demo labels can't reach prod | **1** (config guards), 4 |
