# ADR-0009 — Catalog lifecycle, SKU activation gate, 82-item draft seed

**Status:** Proposed · **Sources:** Spec §04, BRD §3, Arch §09, `docs/catalog_source_82.csv` · **Blocked:** D02/D04/D11

## Model

- `categories(id, source_name UNIQUE, display_name, slug UNIQUE, sort_order, status)` — 8 rows, `source_name` verbatim from the source MD.
- `products(id, category_id, source_index, source_name, source_unit_text, source_note_raw, display_note, display_name NULL→defaults to source_name, slug UNIQUE, origin_type, status, is_internal_supply_hint, created_by NULL (seed))`. `source_*` columns are **immutable** (trigger blocks UPDATE) so provenance is never lost. Unique `(source_index, category_id)`.
- `product_variants` (SKU) — **no rows are seeded.** Columns: `sku UNIQUE, product_id, pack_label, sellable_unit, net_weight_g NULL, pieces_per_pack NULL, storage_class (DRY|AMBIENT|CHILLED|FROZEN|FRAGILE), min_qty, max_qty, quantity_step, status, manufacturer, responsible_entity, shelf_life_days NULL`.
- `unit_conversions(variant_id, from_unit, to_unit, factor_num, factor_den)` per-variant; weight units resolved by `packages/shared/units`.
- `search_aliases(product_id, alias, alias_norm)` — seeded with normalised (diacritic-stripped, lowercase) source name + a **small hand-checked list** of obvious aliases from BRD/Arch examples only ("cùi zip", "trân châu 3Q", "khoai kén"); owner can extend. Search = `pg_trgm` + `unaccent` on `display_name`, `source_name`, aliases.
- `product_media(product_id, kind, url/key, is_illustrative, verified_at NULL)`; `compliance_documents`, `publication_reviews` for the gate.

## Lifecycle & gate

`DRAFT → UNDER_REVIEW → ACTIVE → PAUSED/ARCHIVED` (products and variants). **Publish (`POST /v1/admin/variants/:id/publish`) is refused (`422 SKU_NOT_READY` with `blockers[]`) unless all hold:** pack conversion + net weight, SKU, supplier cost (valid now), retail price (valid now), opening stock ≥ 0 in a warehouse, storage class + shelf-life/lot policy, verified (non-illustrative) media with label/origin/compliance docs, allowed regions + carrier eligibility, `publication_reviews` approval by OWNER. The gate is a pure function with a checklist result that the admin UI renders.
Public endpoints return only `ACTIVE` products having ≥1 `ACTIVE` variant; DRAFT items are 404 publicly (optional "Liên hệ" listing only if D09 approves). Admin can see all.

## Seed (idempotent, `prisma/seed`)

1. Parse `docs/catalog_source_82.csv` (UTF-8, BOM-safe). **Assertions: 82 data rows, 8 distinct categories, per-category counts 13/16/8/4/7/8/17/9**, `is_sellable/sku_verified/images_verified` all `false`.
2. Upsert categories (seeded `ACTIVE`: they are navigation labels taken from the source groups, not sale offers — a category page with 0 ACTIVE products shows an honest "Sắp mở bán" state) then products by `(source_index, category_id)`; slug = `slugify(display_name)` with deterministic de-dup suffix; `status=DRAFT`; `origin_type=UNVERIFIED`; `display_note` strips LaTeX (`$5\text{ kg}$`→`5 kg`) but `source_note_raw` keeps original.
3. Media: link prototype images (`p01..p82` where present) as `is_illustrative=true`; 5 items have none.
4. **Never seeds** price, cost, stock, SKU, expiry, region. Test fixtures (verified-looking variants, prices, stock) live in `prisma/fixtures/test-sku.ts`, tagged `TEST-`, loaded only with `SEED_TEST_FIXTURES=true` and refused when `NODE_ENV=production`.
5. A DB `CHECK` plus startup guard refuse any variant flagged `is_test` when `APP_ENV=production`.
