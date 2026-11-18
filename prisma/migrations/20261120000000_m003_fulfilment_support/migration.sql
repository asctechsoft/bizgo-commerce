-- M003 fulfilment & support: shipments, support requests/messages
-- CreateEnum
CREATE TYPE "SupportType" AS ENUM ('WRONG_ITEM', 'MISSING_ITEM', 'DAMAGED', 'RETURN_EXCHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "carrier" TEXT NOT NULL,
    "tracking_code" TEXT NOT NULL,
    "shipped_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "SupportType" NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "order_item_ids" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "author_type" TEXT NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "support_requests_order_id_created_at_idx" ON "support_requests"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "support_requests_user_id_created_at_idx" ON "support_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "support_requests_status_updated_at_idx" ON "support_requests"("status", "updated_at");

-- CreateIndex
CREATE INDEX "support_messages_request_id_created_at_idx" ON "support_messages"("request_id", "created_at");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "support_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Guard rails
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_type_chk" CHECK ("author_type" IN ('CUSTOMER', 'STAFF'));
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_body_len_chk" CHECK (char_length("body") BETWEEN 1 AND 2000);
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_desc_len_chk" CHECK (char_length("description") BETWEEN 5 AND 2000);
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_fields_chk" CHECK (char_length("carrier") > 0 AND char_length("tracking_code") > 0);
