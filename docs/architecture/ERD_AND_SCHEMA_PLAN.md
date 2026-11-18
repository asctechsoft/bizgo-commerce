# BizGo — ERD and schema plan (Phase 0)

Conventions (ADR-0003/0006): UUIDv7 PKs · `*_vnd BIGINT` · weights in grams · `timestamptz` UTC · soft-delete via `deleted_at` only for non-financial entities · enums = PostgreSQL enums · every table has `created_at`, `updated_at` unless append-only (ledgers/events/audit).
Phase tag = the migration batch in which the table is first created (**tables are never created before the phase that uses them**).

## 1. Identity & access (Phase 1)

```mermaid
erDiagram
  users ||--o{ identities : has
  users ||--o| password_credentials : has
  users ||--o{ refresh_sessions : opens
  users ||--o{ user_roles : granted
  roles ||--o{ user_roles : assigned
  roles ||--o{ role_permissions : contains
  permissions ||--o{ role_permissions : in
  identities ||--o{ otp_challenges : verifies
  users ||--o{ user_consents : records
  users ||--o| customers : "is a"
  users ||--o{ mfa_credentials : protects
  users ||--o{ factory_assignments : "staff of"
  users { uuid id PK  text status  text display_name  timestamptz last_login_at }
  identities { uuid id PK  uuid user_id FK  enum type "EMAIL|PHONE"  text value_norm UK  timestamptz verified_at }
  refresh_sessions { uuid id PK  uuid user_id FK  uuid family_id  bytea token_hash UK  enum realm  timestamptz expires_at  timestamptz revoked_at  uuid rotated_from }
  otp_challenges { uuid id PK  uuid identity_id FK  enum purpose  bytea code_hmac  int attempts  timestamptz expires_at  timestamptz consumed_at }
  mfa_credentials { uuid id PK  uuid user_id FK  bytea secret_enc  bool confirmed  text[] recovery_hashes }
```

Tables: `users, identities, password_credentials, password_reset_tokens, otp_challenges, refresh_sessions, mfa_credentials, roles, permissions, role_permissions, user_roles, user_consents` (P1). `customers, addresses, organizations, organization_members, customer_tiers, wholesale_applications` — `customers/addresses` P1 (account), org/tier/applications P5.

## 2. Catalog (Phase 1 read-only seed; Phase 2 variants/pricing)

```mermaid
erDiagram
  categories ||--o{ products : groups
  products ||--o{ product_variants : "sold as"
  products ||--o{ product_media : shows
  products ||--o{ search_aliases : "found by"
  product_variants ||--o{ unit_conversions : defines
  product_variants ||--o{ variant_attributes : has
  products ||--o{ compliance_documents : evidences
  products ||--o{ publication_reviews : "reviewed by"
  brands ||--o{ products : labels
  categories { uuid id PK  text source_name UK  text display_name  text slug UK  int sort_order  enum status }
  products { uuid id PK  uuid category_id FK  int source_index  text source_name  text source_unit_text  text source_note_raw  text display_note  text display_name  text slug UK  enum origin_type  enum status }
  product_variants { uuid id PK  uuid product_id FK  text sku UK  text pack_label  int net_weight_g  enum storage_class  int min_qty  int max_qty  int quantity_step  enum status  bool is_test }
  product_media { uuid id PK  uuid product_id FK  text storage_key  bool is_illustrative  timestamptz verified_at  int sort_order }
```

`categories, products, product_media, search_aliases` (P1). `product_variants, variant_attributes, unit_conversions, brands, compliance_documents, publication_reviews` (P2). `bundles, bundle_items, reviews` (P5, D18/D19).

## 3. Pricing & commerce (Phase 2)

```mermaid
erDiagram
  price_lists ||--o{ price_rules : has
  product_variants ||--o{ price_rules : priced
  product_variants ||--o{ supplier_costs : costs
  carts ||--o{ cart_items : holds
  checkout_quotes ||--o{ checkout_quote_lines : snapshots
  orders ||--o{ order_items : contains
  orders ||--o{ order_status_events : logs
  orders ||--o{ order_adjustments : adjusted_by
  orders ||--|| order_financials : "financial snapshot"
  orders ||--o{ payments : paid_by
  promotions ||--o{ promotion_redemptions : used
  orders ||--o{ promotion_redemptions : applies
  orders { uuid id PK  text order_number UK  uuid customer_id FK  enum channel  enum status  enum payment_summary  jsonb contact_snapshot  jsonb ship_address_snapshot  bigint total_vnd  bool is_test  timestamptz created_at }
  order_items { uuid id PK  uuid order_id FK  uuid variant_id FK  text sku_snap  text name_snap  text pack_label_snap  int net_weight_g_snap  int qty  bigint unit_price_vnd  bigint line_discount_vnd  bigint line_total_vnd  bigint supplier_cost_vnd "permissioned" }
  order_financials { uuid order_id PK  bigint revenue_net_vnd  bigint shipping_charged_vnd  bigint cost_snapshot_vnd  bigint packaging_vnd  bigint fees_vnd  bigint expected_margin_vnd  bigint actual_margin_vnd }
  carts { uuid id PK  uuid customer_id FK  text guest_token_hash  enum channel  timestamptz expires_at }
  checkout_quotes { uuid id PK  int version  timestamptz expires_at  jsonb snapshot  uuid actor_id }
  price_rules { uuid id PK  uuid price_list_id FK  uuid variant_id FK  uuid tier_id  int min_qty  bigint unit_price_vnd  tstzrange valid  int priority }
```

`price_lists, price_rules, supplier_costs(alias of "factory_costs" in Arch), carts, cart_items, checkout_quotes, orders, order_items, order_status_events, order_financials, payments, payment_events, idempotency_keys, outbox_events, audit_logs, settings` (P2). `promotions, promotion_redemptions, order_adjustments` (P2/P3). `discount_approvals` (P4).

## 4. Inventory & supply (Phase 2 core, Phase 3 lots/quality)

```mermaid
erDiagram
  warehouses ||--o{ inventory_balances : stocks
  product_variants ||--o{ inventory_balances : "stocked as"
  inventory_balances ||--o{ stock_movements : ledger
  inventory_lots ||--o{ stock_movements : touches
  orders ||--o{ inventory_reservations : holds
  inventory_reservations }o--|| inventory_balances : reserves
  factories ||--o{ warehouses : operates
  factories ||--o{ factory_assignments : staffed
  suppliers ||--o{ supplier_costs : quotes
  inventory_lots ||--o{ quality_holds : "may have"
  quality_holds }o--o| recall_cases : "part of"
  inventory_balances { uuid warehouse_id PK  uuid variant_id PK  bigint on_hand  bigint reserved  bigint quarantined  bigint version }
  stock_movements { uuid id PK  uuid warehouse_id  uuid variant_id  uuid lot_id  enum type  bigint qty  text reason_code  uuid actor_id  text ref_type  uuid ref_id  text idempotency_key }
  inventory_reservations { uuid id PK  uuid order_item_id FK  uuid warehouse_id  uuid variant_id  bigint qty  enum status  timestamptz expires_at }
```

`warehouses, inventory_balances, stock_movements, inventory_reservations, suppliers` (P2); `factories, factory_assignments, inventory_lots, quality_holds, recall_cases` (P3).

## 5. Fulfillment & shipping (Phase 3)

```mermaid
erDiagram
  orders ||--o{ fulfillments : "assigned as"
  factories ||--o{ fulfillments : handles
  fulfillments ||--o{ fulfillment_items : lists
  fulfillment_items ||--o{ pick_events : picks
  inventory_lots ||--o{ pick_events : "from lot"
  fulfillments ||--o{ packed_parcels : packs
  packed_parcels ||--o{ packaging_evidence : proves
  orders ||--o{ shipments : ships
  shipments ||--o{ shipment_parcels : carries
  packed_parcels ||--o{ shipment_parcels : "in"
  shipments ||--o{ shipment_events : tracks
  fulfillments { uuid id PK  uuid order_id FK  uuid factory_id FK  enum status  timestamptz sla_due_at  text exception_code }
  shipments { uuid id PK  uuid order_id FK  enum status  text carrier_name  text tracking_code  bigint actual_fee_vnd "finance-only"  bigint cod_amount_vnd "finance-only" }
```

`fulfillments, fulfillment_items, pick_events, packed_parcels, packaging_evidence, shipments, shipment_parcels, shipment_events, notifications, email_jobs, file_objects` (P3); `carrier_quotes` (P5).

## 6. Money & after-sales (Phase 4)

`bank_transfer_verifications, refunds, receivables, cod_reconciliations, settlements, settlement_items, returns, return_items, complaints, support_tickets, support_messages, contact_requests, content_pages, banners, articles` (P4; `contact_requests/support_tickets` may land earlier with P2 because storefront forms need real endpoints). B2B (P5): `quotes, quote_items, invoices(only after D01/D14)`. Mobile (P6): `device_tokens`.

## 7. Key constraints & indexes (non-exhaustive, enforced in migrations)

- `products(slug)`, `product_variants(sku)`, `orders(order_number)`, `idempotency_keys(actor_scope, scope, key)`, `payment_events(provider, provider_event_id)` UNIQUE.
- `CHECK` on `inventory_balances` (ADR-0004); `CHECK` price ≥ 0, qty > 0; exclusion constraint on overlapping price windows.
- FKs `ON DELETE RESTRICT` for anything financial; no cascade to orders/ledgers.
- Indexes: `products(category_id,status)`, `orders(customer_id,created_at desc)`, `orders(status,created_at)`, `inventory_lots(variant_id,expires_at)`, `outbox_events(available_at) WHERE status='PENDING'`, `price_rules(variant_id, tier_id, valid)` GiST, `search_aliases(alias_norm gin_trgm_ops)`, `products(display_name gin_trgm_ops)`.
- Triggers: immutable `products.source_*`; append-only `stock_movements`, `*_status_events`, `audit_logs`, `payment_events`.
- DB roles: `bizgo_app` (read/write, no DDL), `bizgo_migrator`, `bizgo_factory_ro` (select on factory views only), `bizgo_audit_writer` (insert-only on `audit_logs`).

## 8. Migration strategy

1. **M001 (P1):** extensions (`pgcrypto`, `pg_trgm`, `unaccent`, `btree_gist`), enums, identity tables, categories/products/media/aliases, audit/outbox/idempotency/settings, DB roles & grants, triggers.
2. Prisma `schema.prisma` is the source for tables/enums; raw SQL migration steps (CHECKs, exclusion constraints, triggers, views, roles) live in the same migration folder (`migration.sql` edited after `prisma migrate dev --create-only`). Every such migration has a documented down/rollback note (forward-only in prod; rollback = restore-forward fix).
3. Seed is a separate idempotent program (`prisma/seed`), not a migration, so migrations stay environment-neutral.
4. CI test: migrate from empty DB → run seed twice (idempotent) → assert counts (82/8) → `prisma migrate diff` shows no drift.
