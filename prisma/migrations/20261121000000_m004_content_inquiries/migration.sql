-- M004 content & inquiries: guide articles (admin-editable) and public lead forms
-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('RECIPE', 'INGREDIENT', 'BUSINESS', 'STORAGE', 'WHOLESALE');

-- CreateEnum
CREATE TYPE "InquiryKind" AS ENUM ('QUOTE', 'CONTACT', 'NEWSLETTER');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'SPAM');

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "ArticleCategory" NOT NULL,
    "cover_image" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "read_minutes" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "InquiryKind" NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "full_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "business_type" TEXT,
    "province" TEXT,
    "topic" TEXT,
    "message" TEXT,
    "consent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_hash" TEXT,
    "handled_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_published_at_idx" ON "articles"("status", "published_at");

-- CreateIndex
CREATE INDEX "articles_category_status_published_at_idx" ON "articles"("category", "status", "published_at");

-- CreateIndex
CREATE INDEX "articles_featured_status_published_at_idx" ON "articles"("featured", "status", "published_at");

-- CreateIndex
CREATE INDEX "inquiries_kind_status_created_at_idx" ON "inquiries"("kind", "status", "created_at");

-- CreateIndex
CREATE INDEX "inquiries_email_idx" ON "inquiries"("email");

-- Guard rails
ALTER TABLE "articles" ADD CONSTRAINT "articles_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "articles" ADD CONSTRAINT "articles_published_chk" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL);
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_contact_chk" CHECK (
  ("kind" = 'NEWSLETTER' AND "email" IS NOT NULL)
  OR ("kind" <> 'NEWSLETTER' AND "full_name" IS NOT NULL AND "phone" IS NOT NULL AND "message" IS NOT NULL)
);
