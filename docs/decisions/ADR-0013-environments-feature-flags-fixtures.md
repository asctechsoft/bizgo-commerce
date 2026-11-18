# ADR-0013 — Environments, feature flags, fail-closed defaults, test fixtures

**Status:** Proposed · **Sources:** Spec §12, Arch §11, CLAUDE.md ("mock fixtures only under explicit dev flag")

- `APP_ENV` ∈ `local | test | staging | production` validated at boot (zod). Production config validator **refuses to start** if any of: `DEV_OTP_CONSOLE=true`, `SEED_TEST_FIXTURES=true`, `NEXT_PUBLIC_DEMO_FIXTURES=true`, default/blank secrets, wildcard CORS, missing `DATABASE_URL`/`REDIS_URL`.
- **Flags (all default to the safe value; owner decisions flip them):** `GUEST_CHECKOUT_ENABLED=false` (D16) · `BANK_TRANSFER_ENABLED=false` (D06) · `COD_ENABLED=false` until D01/D06/D05 · `PAYMENT_GATEWAY_ENABLED=false` · `CARRIER_API_ENABLED=false` · `WHOLESALE_ENABLED=false` (Phase 5) · `ACCOUNT_DELETION_ENABLED=false` (D09) · `PUBLIC_CATALOG_SHOW_DRAFT_AS_CONTACT=false` (D09).
  Flags live in env for infra-level switches and in `settings` table (audited, OWNER-editable) for business switches.
- **Fixtures:** `TEST-` SKUs, `TEST` warehouse and test prices exist only in `prisma/fixtures` and `backend/*/test`. UI shows a persistent "DỮ LIỆU THỬ NGHIỆM" ribbon when a cart/order contains `is_test` items; an `is_test` order cannot reach a real payment or notification channel (outbound adapters check `is_test`). Production DB has a `CHECK` preventing `is_test` rows (ADR-0009).
- **Environments:** `local` = Docker Compose (Postgres 16, Redis 7, MinIO, Mailpit) + optional `embedded-postgres` for developers/CI without Docker; `staging` = TLS, sandbox providers, synthetic data only; `production` = DB/Redis on private network, no public ports, backups off-site (D10).
- **CI (GitHub Actions or equivalent, provider TBD in D10):** install, lint, typecheck, unit, integration (service containers for PG/Redis), OpenAPI drift check, Prisma migrate-from-scratch + `migrate diff` check, e2e (Playwright) on schedule, secret scan, dependency audit.
- **Migrations:** forward-only, one concern per migration, additive first (expand → migrate → contract); `prisma migrate deploy` only in staging/prod; `migrate dev/reset` forbidden outside `local/test` (script refuses when `APP_ENV` is staging/production).
