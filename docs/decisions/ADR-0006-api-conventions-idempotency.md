# ADR-0006 — REST API conventions, error model, idempotency, pagination

**Status:** Proposed · **Sources:** Spec §09, Arch §05/§07

## Conventions

- Base `https://api.<domain>/v1`; configured by env in every client (never an IP). OpenAPI 3.1 is **generated from NestJS** (`@nestjs/swagger`) and committed at `docs/api/openapi.yaml`; CI fails if the committed file differs from the generated one. `packages/contracts` generates TS types + a fetch client from it.
- **Success:** `{ "data": …, "meta": { requestId, page?, … } }`. **Error:** `{ "code": "UPPER_SNAKE", "message": "<vi, safe>", "details": [...], "requestId": "…" }`. `code` values are enumerated in `packages/shared/error-codes` and in OpenAPI. Messages never contain stack traces, SQL, or internal ids not owned by the caller.
- HTTP mapping: 400 `VALIDATION_ERROR` · 401 `UNAUTHENTICATED` · 403 `FORBIDDEN` · 404 `NOT_FOUND` (also out-of-scope) · 409 `INVALID_STATE_TRANSITION|IDEMPOTENCY_CONFLICT|OUT_OF_STOCK|PRICE_CHANGED` · 410/422 `QUOTE_EXPIRED|SKU_NOT_READY|DELIVERY_UNSUPPORTED|INVALID_PACK_CONVERSION|LOT_EXPIRED|PAYMENT_NOT_VERIFIED` · 429 `RATE_LIMITED` (with `Retry-After`) · 503 `OTP_DELIVERY_NOT_CONFIGURED|FEATURE_DISABLED`.
- **Validation:** `class-validator` DTOs at controller boundary (whitelist + forbidNonWhitelisted); domain invariants re-checked in services. Request `X-Request-Id` accepted/generated and echoed; propagated into logs, audit and outbox.
- **IDs:** internal UUIDv7 (time-ordered); public order number `BG-YYMMDD-XXXXXX` (random base32, unique, non-enumerable); slugs for catalog. Tracking/guest endpoints require code **and** verification (never public id alone).
- **Pagination:** `?page&limit` (limit ≤ 100, default 24) for catalog/admin tables; cursor for large feeds (audit, events). Sort whitelist per endpoint.
- **Time:** ISO-8601 UTC in payloads.

## Idempotency (money/order mutations)

`Idempotency-Key` header **required** on `POST /v1/orders`, refunds, payment verification, shipment creation, fulfillment `handover`, settlement actions, return approvals.
Table `idempotency_keys(actor_scope, scope, key) UNIQUE, request_hash, response_status, response_body, locked_until, expires_at(24 h+)`.
Algorithm (single DB transaction with the business write):

1. `INSERT … ON CONFLICT DO NOTHING`. If the row exists: same `request_hash` ⇒ return stored response (or `409 IDEMPOTENCY_IN_PROGRESS` if still locked); different hash ⇒ `409 IDEMPOTENCY_CONFLICT`.
2. Execute business logic; store response snapshot; commit.
   Client double-click ⇒ one order, one reservation set, one outbox event.

## Quote/price handshake

`POST /v1/checkout/quote` → persisted `checkout_quotes(id, version, expires_at, snapshot, actor)`; TTL `CHECKOUT_QUOTE_TTL_SECONDS` (default 900, config not business data). `POST /v1/orders` sends `{checkoutQuoteId, acceptedQuoteVersion}`; server **re-prices and re-validates** everything and fails with `PRICE_CHANGED` (returns new quote) / `OUT_OF_STOCK` / `QUOTE_EXPIRED` rather than silently proceeding.

## Rate limiting

Redis token buckets: login, OTP, register, password-forgot, guest-track, contact/support, checkout quote/order, with per-IP and per-identifier keys; limits in config; `429` with `Retry-After`.

## Versioning

Additive changes within `/v1`; breaking ⇒ `/v2`. Mobile-safe: no cookie-only features without bearer equivalent.
