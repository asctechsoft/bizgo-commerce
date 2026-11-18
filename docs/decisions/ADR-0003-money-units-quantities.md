# ADR-0003 — Money, weights, units, quantities

**Status:** Proposed · **Sources:** Spec §04/§05 inv.1, BRD §3.2/§4.1, Arch §4.1 · **Open:** D02 (loose-weight step), D14 (tax)

## Decision

- **Currency:** single currency VND. Stored as **`BIGINT` integer đồng** (`*_vnd` columns). No `float/real/double`, no `numeric` with fractions. `BIGINT` (not `INT`) because tonne-scale B2B orders and settlements exceed 2.1 billion.
- **TypeScript:** `Money = bigint` inside services; `packages/shared/money` provides `add/sub/mulInt/allocate(total, weights)` (largest-remainder, sums exactly) and rejects non-integers. Over the wire (JSON) amounts are **integers** (safe < 2^53; guard at serialization, fail loudly above `Number.MAX_SAFE_INTEGER`). Percent discounts use basis points (`bps` integer) and `roundHalfUp` on the line.
- **Weights:** integer **grams** (`net_weight_g`, `gross_weight_g`). Conversions only for weight units: `kg=1000 g`, `yến=10 kg`, `tạ=100 kg`, `tấn=1000 kg`. Implemented once in `packages/shared/units`; `convertWeight()` throws `INVALID_PACK_CONVERSION` for `bao/bì/túi/thùng/set/hộp/khay/lon/cuộn/cây/gói/quả/cái` unless a **variant-specific** `unit_conversions` row exists.
- **Quantity of an order line:** positive **integer count of the variant's sellable unit** (`pack_unit`). A "per kg loose" offering is modelled as a variant whose sellable unit is `1 kg` (`net_weight_g=1000`) with an optional `quantity_step`/`min_qty`/`max_qty` (integers, in sellable units). Fractional kg is **not** supported until D02 says otherwise; no float quantities anywhere.
- **Snapshots:** `order_items` store `variant_sku`, `product_source_name`, `display_name`, `pack_label`, `net_weight_g`, `unit_price_vnd`, `line_discount_vnd`, `line_total_vnd`, `tax_status`, `tax_vnd NULL`, and `supplier_cost_vnd` (permissioned column; never in customer/factory DTOs). Later price/cost edits never touch existing rows.
- **Tax:** `tax_status ENUM(UNDETERMINED, INCLUSIVE, EXCLUSIVE, EXEMPT)`; default `UNDETERMINED` ⇒ real-SKU checkout blocked (D14). No hard-coded VAT rate.
- **Timestamps:** `timestamptz` UTC; display Asia/Ho_Chi_Minh. Business dates (price validity) use half-open `[from, to)` intervals.

## Consequences

Deterministic, auditable totals; rounding allocation unit-tested (sum of allocated discounts == total). Extra conversion code for BigInt↔JSON at the edges (central helper).
