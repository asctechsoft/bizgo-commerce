# ADR-0001 — Modular monolith, pnpm monorepo, stack

**Status:** Proposed (Phase 0) · **Date:** 2026-11-18 · **Sources:** BRD §01, Arch §01–02, Spec §00/§02

## Context

Single-seller commerce (BizGo) with a partner factory as fulfillment. MVP must ship fast, keep money/stock transactional, and later serve a Flutter app via the same contract. Team is small; microservices are explicitly out of scope.

## Decision

- **Modular monolith** `backend/api` (NestJS) + separate process `backend/worker` (same codebase/modules, BullMQ consumers + outbox publisher + cron). No inter-module DB access: modules talk through exported services/ports and domain events.
- **Monorepo** with **pnpm workspaces** (+ Turborepo optional later):
  ```
  web/storefront        Next.js (public site + customer account)
  web/backoffice        Next.js (/admin and /factory route groups)
  backend/api           NestJS REST /v1
  backend/worker        outbox publisher + schedulers (BullMQ later)
  mobile/               Flutter app (Phase 6; placeholder only)
  packages/contracts    API types + client (shared by web and mobile-safe contract)
  packages/shared       money, units, permissions, error codes, constants
  packages/db           Prisma client, seed, real-PostgreSQL test harness
  packages/ui-web       design tokens + accessible primitives
  prisma/               schema + migrations
  infra/docker, infra/deploy, infra/monitoring
  ```
- **Stack:** Node ≥22, TypeScript strict, Next.js (App Router) + Tailwind, NestJS, PostgreSQL 16 + Prisma, Redis 7 + BullMQ, S3-compatible storage (MinIO in dev), Vitest/Jest + Playwright.
- `backoffice-web` hosts **admin and factory in one Next.js app** (Spec §02) with **hard separation**: distinct session cookie names/realms (`bg_admin`, `bg_factory`), distinct layouts, route-group middleware that rejects the wrong realm, and an automated test that the factory route tree imports nothing from `admin/finance`. The API is the real boundary (ADR-0008).
- No `DEMO_MODE` in production builds: the flag is read at **build time**; production build fails if it is `true`.

## Consequences

- One deployable backend, simple transactions across orders/inventory/payments.
- Shared contracts avoid drift between web, backoffice and future mobile.
  − One backoffice bundle contains both portals ⇒ mitigated above; re-split if factory users connect from outside BizGo-managed devices.
  − Worker shares code with API ⇒ strict module boundaries enforced by lint rule (`no-restricted-imports` per module path).

## Alternatives rejected

Microservices (premature); separate admin and factory repos (duplicated UI/auth); Nx (heavier than needed).

## Addendum 2026-11-18 (Phase 1)
- Folders grouped by platform: `web/`, `backend/`, `mobile/` (owner request); package names stay `@bizgo/*`.
- Versions pinned to majors known stable at implementation time: Node ≥22, TypeScript 5.9, NestJS 11, Prisma 6.19, Next.js 15.5, React 19.1, Tailwind 3.4, Vitest 3.2, PostgreSQL 17 (compose/CI/embedded). Newer majors exist (NestJS 12, Prisma 7, Next 16, TS 7) and are an explicit later upgrade, not a Phase 1 goal.
- Primary keys use `gen_random_uuid()` (UUIDv4) instead of UUIDv7 until PostgreSQL 18 `uuidv7()` is adopted.
- Package manager bootstrap: `corepack pnpm …` (no global pnpm needed).
