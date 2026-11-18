# ADR-0007 — Transactional outbox, background jobs, audit log

**Status:** Proposed · **Sources:** Spec §05 inv.4, §11, Arch §07 · BullMQ/Redis per Arch §01

## Decision

- **Outbox:** `outbox_events(id, aggregate_type, aggregate_id, type, payload jsonb, occurred_at, available_at, attempts, status PENDING|PUBLISHED|DEAD, locked_by, locked_until, dedupe_key UNIQUE)`. Written **in the same transaction** as the state change. Worker polls `SELECT … WHERE status='PENDING' AND available_at<=now() ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT n`, enqueues to BullMQ (or runs in-process handler), marks `PUBLISHED`. Exponential backoff; after N attempts ⇒ `DEAD` + alert metric. Partial index on `(available_at) WHERE status='PENDING'`.
- **Delivery is at-least-once**: every handler is idempotent via `processed_events(handler, event_id) UNIQUE` or natural-key upserts. Notifications, emails, and webhooks are **never** sent inside the checkout transaction.
- **Redis is not authoritative** for money, stock, or idempotency; it holds rate-limit counters, BullMQ queues, and optional caches of public catalog data. Losing Redis must not corrupt data (only delay jobs).
- **Scheduled jobs (worker):** reservation expiry sweep, outbox publisher, stale-quote cleanup, ledger-vs-balance drift check, expired-lot flagger, unremitted-COD aging, failed-job/DLQ alerts, idempotency-key TTL purge, OTP/session purge.
- **Audit:** `audit_logs(id, occurred_at, actor_id, actor_role, action, entity_type, entity_id, before jsonb, after jsonb, request_id, ip_hash, reason)` append-only (DB role without UPDATE/DELETE; trigger blocks mutation). `before/after` pass through an allow/redact list (no passwords, OTP, tokens, full PII). Written for: price/cost/role/permission changes, status transitions, inventory adjustments, payment/refund/settlement actions, privileged logins, forbidden-access attempts (rate-sampled).
- **Retention** of audit/ledger/financial rows: no cascading deletes; PII redaction replaces fields in place (policy values pending D09).

## Consequences

Exactly-once _effects_ achieved via idempotent consumers on at-least-once delivery; small extra table writes per mutation.
