/**
 * DEV ONLY: loads clearly-marked TEST SKUs for ALL 82 source products so the whole shop can be clicked through
 * locally. Prices come from `src/fixtures/demo-prices.json` (editable; DEMO numbers, not commercial prices) and are
 * re-synced on every run. One SKU per unit listed in the source (e.g. "Kg / Bao / Bì"), 200 in stock, cost = 65%.
 *   pnpm --filter @bizgo/db dev:fixtures
 * Refused when APP_ENV=production. Never part of the real seed (ADR-0009/0013/0014).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  createTestSku,
  unlockCheckoutForTests,
  assertFixturesAllowed,
} from '../src/fixtures/test-fixtures';

const PRICES = JSON.parse(
  readFileSync(join(__dirname, '../src/fixtures/demo-prices.json'), 'utf8'),
) as { prices: Record<string, number> };

const asciiCode = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase();

async function main() {
  assertFixturesAllowed();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({ orderBy: { sourceIndex: 'asc' } });
    let created = 0;
    let repriced = 0;
    for (const p of products) {
      const price = PRICES.prices[String(p.sourceIndex)];
      if (price === undefined) continue;
      const units = [
        ...new Set(
          p.sourceUnitText
            .split('/')
            .map((u) => u.trim())
            .filter(Boolean),
        ),
      ];
      for (const unit of units.length ? units : ['Gói']) {
        const sku = `TEST-BIZ-${String(p.sourceIndex).padStart(3, '0')}-${asciiCode(unit)}`;
        const existing = await prisma.productVariant.findUnique({ where: { sku } });
        if (!existing) {
          await createTestSku(prisma, {
            productId: p.id,
            sku,
            packLabel: unit,
            priceVnd: BigInt(price),
            costVnd: BigInt(Math.round(price * 0.65)),
            stock: 200n,
          });
          created++;
          continue;
        }
        const now = new Date();
        const current = await prisma.priceRule.findFirst({
          where: {
            variantId: existing.id,
            channel: 'RETAIL',
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
          orderBy: { validFrom: 'desc' },
        });
        if (!current || current.unitPriceVnd !== BigInt(price)) {
          await prisma.$transaction(async (tx) => {
            if (current)
              await tx.priceRule.update({
                where: { id: current.id },
                data: { validTo: new Date(now.getTime() - 1000) },
              });
            await tx.priceRule.create({
              data: {
                variantId: existing.id,
                channel: 'RETAIL',
                minQty: 1,
                unitPriceVnd: BigInt(price),
                validFrom: now,
              },
            });
          });
          repriced++;
        }
      }
    }
    // legacy 3-sample fixtures (pre-ADR-0014) are superseded by the per-unit SKUs above
    await prisma.productVariant.updateMany({
      where: { sku: { startsWith: 'TEST-DEMO-' }, status: 'ACTIVE' },
      data: { status: 'ARCHIVED' },
    });
    await unlockCheckoutForTests(prisma, {
      provinces: ['Hà Nội', 'Hồ Chí Minh'],
      shipping: 'MANUAL_QUOTE',
    });
    console.log(
      `TEST fixtures: ${created} new TEST SKUs, ${repriced} repriced (demo prices from demo-prices.json); checkout unlocked for Hà Nội / Hồ Chí Minh (COD, phí ship báo sau).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
