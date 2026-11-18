-- M002 commerce core: variants, prices, costs, inventory ledger, cart, quotes, orders, reservations
-- CreateEnum
CREATE TYPE "StorageClass" AS ENUM ('DRY', 'AMBIENT', 'CHILLED', 'FROZEN', 'FRAGILE');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('RETAIL', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PACKING', 'READY_TO_SHIP', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'ON_HOLD', 'CANCEL_REQUESTED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AWAITING_VERIFICATION', 'AUTHORIZED', 'PAID', 'FAILED', 'EXPIRED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ADJUST_PLUS', 'ADJUST_MINUS', 'RESERVE', 'RELEASE', 'DISPATCH', 'RETURN_RESTOCK', 'QUARANTINE_IN', 'QUARANTINE_OUT', 'COUNT_CORRECTION');

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "pack_label" TEXT NOT NULL,
    "sellable_unit" TEXT NOT NULL,
    "net_weight_g" INTEGER,
    "pieces_per_pack" INTEGER,
    "storage_class" "StorageClass",
    "min_qty" INTEGER NOT NULL DEFAULT 1,
    "max_qty" INTEGER,
    "quantity_step" INTEGER NOT NULL DEFAULT 1,
    "manufacturer" TEXT,
    "responsible_entity" TEXT,
    "shelf_life_days" INTEGER,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "channel" "SalesChannel" NOT NULL DEFAULT 'RETAIL',
    "tier_id" UUID,
    "min_qty" INTEGER NOT NULL DEFAULT 1,
    "unit_price_vnd" BIGINT NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_costs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "cost_vnd" BIGINT NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "warehouse_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "on_hand" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "quarantined" BIGINT NOT NULL DEFAULT 0,
    "version" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("warehouse_id","variant_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qty" BIGINT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "actor_id" UUID,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "idempotency_key" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "address_id" UUID,
    "snapshot" JSONB NOT NULL,
    "can_place_order" BOOLEAN NOT NULL,
    "total_vnd" BIGINT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_number" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "SalesChannel" NOT NULL DEFAULT 'RETAIL',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "payment_method" "PaymentMethod" NOT NULL,
    "contact_snapshot" JSONB NOT NULL,
    "ship_address_snapshot" JSONB NOT NULL,
    "subtotal_vnd" BIGINT NOT NULL,
    "discount_vnd" BIGINT NOT NULL DEFAULT 0,
    "shipping_fee_vnd" BIGINT,
    "total_vnd" BIGINT NOT NULL,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "quote_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "sku_snap" TEXT NOT NULL,
    "name_snap" TEXT NOT NULL,
    "pack_label_snap" TEXT NOT NULL,
    "net_weight_g_snap" INTEGER,
    "storage_class_snap" "StorageClass",
    "qty" INTEGER NOT NULL,
    "unit_price_vnd" BIGINT NOT NULL,
    "line_discount_vnd" BIGINT NOT NULL DEFAULT 0,
    "line_total_vnd" BIGINT NOT NULL,
    "supplier_cost_vnd" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_id" UUID,
    "reason_code" TEXT,
    "request_id" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_financials" (
    "order_id" UUID NOT NULL,
    "revenue_net_vnd" BIGINT NOT NULL,
    "cost_snapshot_vnd" BIGINT,
    "expected_margin_vnd" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_financials_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_vnd" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "qty" BIGINT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_status_idx" ON "product_variants"("product_id", "status");

-- CreateIndex
CREATE INDEX "price_rules_variant_id_channel_valid_from_idx" ON "price_rules"("variant_id", "channel", "valid_from");

-- CreateIndex
CREATE INDEX "supplier_costs_variant_id_valid_from_idx" ON "supplier_costs"("variant_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_idempotency_key_key" ON "stock_movements"("idempotency_key");

-- CreateIndex
CREATE INDEX "stock_movements_warehouse_id_variant_id_occurred_at_idx" ON "stock_movements"("warehouse_id", "variant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_ref_type_ref_id_idx" ON "stock_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE INDEX "checkout_quotes_user_id_created_at_idx" ON "checkout_quotes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_status_events_order_id_occurred_at_idx" ON "order_status_events"("order_id", "occurred_at");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_order_id_idx" ON "inventory_reservations"("order_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_status_expires_at_idx" ON "inventory_reservations"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_costs" ADD CONSTRAINT "supplier_costs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_financials" ADD CONSTRAINT "order_financials_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================================
-- M002 raw SQL (hand-written). See ADR-0004 (inventory), ADR-0005 (status events), ADR-0010 (pricing).
-- Rollback note: forward-only; revert in non-production by dropping the database.
-- =====================================================================================

-- Inventory invariants (ADR-0004): stock can never go negative nor be over-reserved.
ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "inventory_balances_nonneg_ck" CHECK ("on_hand" >= 0 AND "reserved" >= 0 AND "quarantined" >= 0),
  ADD CONSTRAINT "inventory_balances_cover_ck" CHECK ("on_hand" >= "reserved" + "quarantined");

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_qty_ck" CHECK ("qty" > 0);

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_qty_ck" CHECK ("qty" > 0);

-- Money and quantity sanity (integers VND only, ADR-0003).
ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_price_ck" CHECK ("unit_price_vnd" >= 0 AND "min_qty" >= 1),
  ADD CONSTRAINT "price_rules_window_ck" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");
ALTER TABLE "supplier_costs"
  ADD CONSTRAINT "supplier_costs_cost_ck" CHECK ("cost_vnd" >= 0),
  ADD CONSTRAINT "supplier_costs_window_ck" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_qty_ck" CHECK ("min_qty" >= 1 AND "quantity_step" >= 1 AND ("max_qty" IS NULL OR "max_qty" >= "min_qty")),
  ADD CONSTRAINT "product_variants_weight_ck" CHECK ("net_weight_g" IS NULL OR "net_weight_g" > 0);
ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_qty_ck" CHECK ("quantity" >= 1);
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_qty_ck" CHECK ("qty" >= 1 AND "unit_price_vnd" >= 0 AND "line_total_vnd" >= 0);
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_ck" CHECK ("subtotal_vnd" >= 0 AND "total_vnd" >= 0 AND "discount_vnd" >= 0);

-- Price windows for the same variant/channel/quantity break must not overlap (deterministic resolution).
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Enum -> text is only STABLE in PostgreSQL; labels of this enum never change, so an IMMUTABLE wrapper is safe
-- and required for use inside an index expression.
CREATE FUNCTION "bizgo_channel_text"("c" "SalesChannel") RETURNS text AS $$ SELECT "c"::text $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_no_overlap_ex" EXCLUDE USING gist (
    "variant_id" WITH =,
    "bizgo_channel_text"("channel") WITH =,
    "min_qty" WITH =,
    (COALESCE("tier_id"::text, '')) WITH =,
    tstzrange("valid_from", COALESCE("valid_to", 'infinity'::timestamptz), '[)') WITH &&
  );

-- Append-only ledgers (re-uses the M001 trigger function).
CREATE TRIGGER "stock_movements_append_only_trg"
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "bizgo_forbid_mutation"();
CREATE TRIGGER "order_status_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "order_status_events"
  FOR EACH ROW EXECUTE FUNCTION "bizgo_forbid_mutation"();

-- Snapshots on an order line are immutable after creation (price/cost edits must never rewrite history).
CREATE FUNCTION "bizgo_order_items_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."sku_snap" IS DISTINCT FROM OLD."sku_snap"
     OR NEW."name_snap" IS DISTINCT FROM OLD."name_snap"
     OR NEW."qty" IS DISTINCT FROM OLD."qty"
     OR NEW."unit_price_vnd" IS DISTINCT FROM OLD."unit_price_vnd"
     OR NEW."line_total_vnd" IS DISTINCT FROM OLD."line_total_vnd"
     OR NEW."supplier_cost_vnd" IS DISTINCT FROM OLD."supplier_cost_vnd" THEN
    RAISE EXCEPTION 'order_items snapshot columns are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "order_items_immutable_trg"
  BEFORE UPDATE ON "order_items"
  FOR EACH ROW EXECUTE FUNCTION "bizgo_order_items_immutable"();

-- A reservation can only leave HELD once (exactly-once release/consume, ADR-0004).
CREATE FUNCTION "bizgo_reservation_terminal"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'HELD' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION 'inventory_reservations: % is terminal', OLD."status"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_reservations_terminal_trg"
  BEFORE UPDATE ON "inventory_reservations"
  FOR EACH ROW EXECUTE FUNCTION "bizgo_reservation_terminal"();
