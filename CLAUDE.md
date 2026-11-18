# CLAUDE.md — BizGo execution rules

You are the lead full-stack engineer implementing BizGo from source artifacts, NOT creating a speculative multivendor marketplace.

## Mandatory reading order
1. `docs/BIZGO_MASTER_IMPLEMENTATION_SPEC.md`
2. `source/BizGo_01_Dac_ta_nghiep_vu_BRD.docx`
3. `source/BizGo_02_Kien_truc_code_va_luong_ung_dung.docx`
4. `source/danh_s_ch_nguy_n_li_u_n_u_ch_n_v_t.md` and `docs/catalog_source_82.csv`
5. `source/BizGo_Web_Responsive_Prototype.zip` → HTML/CSS/JS and images as VISUAL REFERENCE ONLY
6. `docs/ui_route_api_matrix.csv`, `docs/IMPLEMENTATION_TODO.md`, `docs/decisions/DECISION_LOG.md`

## Safety and architectural rules
- Single seller BizGo, partner factory fulfills. Do not implement sellers or stores marketplace.
- Target Next.js storefront/backoffice, NestJS modular monolith, PostgreSQL/Prisma, Redis/BullMQ, S3 assets, OpenAPI, RBAC. Document ADR for changes.
- Business logic, price, discounts, stock, shipping feasibility, order state, payment state belong to backend. Frontend cannot force paid/confirmed or trust client totals.
- 82 source products start DRAFT; no invented SKU, size, price, inventory, expiry, brand packaging, legal status, actual registered seller or shipping/carrier fee.
- Factory DTOs must never reveal retail pricing, cost, margin, discounts, payments/settlements. Enforce server-side resource scoping.
- Use idempotency and real PostgreSQL transactions for orders/holds/payments/refunds; event outbox and audit for money-sensitive writes.
- Remove localStorage demo auth, fixed OTP, mock order numbers and mock checkout; keep mock fixtures only under explicit dev feature flag.
- Tests are mandatory: concurrency, webhook replay, permissions, cancellation, price changes, COD reconciliation, responsive 320-1920.
- Maintain UI visual design from HTML (green/orange branding) but rebuild semantic components and real Next.js routing.
- Never silently claim a feature working if backend call is mocked, or a screen is merely a placeholder.

## Work mode
Start with `PHASE 0` assessment: produce gap list, ADRs, schema/ERD, backend state diagrams, OpenAPI draft, phased TODO, list of BLOCKED_DECISION. Do not write full application in one go.
Then implement vertical slices Phase 1 onward with small commits, migrations, tests and clear Done criteria. At each phase finish report: files changed, migrations, routes/API built, commands/tests/results, screenshots viewport checks, deviations/risks, next steps. Ask for business approval ONLY when a specific blocked real-world decision is necessary; continue other safe work.

## First command prompt for human
Read all BizGo handoff sources and execute only Phase 0 architecture analysis. Produce ADR, ERD, permission matrix, OpenAPI skeleton, state transitions, and refined tasks. No production integration or invented commercial data. Then implement Phase 1 once reviewed.
