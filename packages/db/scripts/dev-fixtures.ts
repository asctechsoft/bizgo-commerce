/**
 * DEV ONLY: loads a few clearly-marked TEST SKUs (prices/costs/stock are ARBITRARY test numbers) and the
 * settings that unlock checkout for them, so the shop can be clicked through locally.
 *   pnpm --filter @bizgo/db dev:fixtures
 * Refused when APP_ENV=production. Never part of the real seed (ADR-0009/0013).
 */
import { PrismaClient } from '@prisma/client';
import {
  createTestSku,
  unlockCheckoutForTests,
  assertFixturesAllowed,
} from '../src/fixtures/test-fixtures';

async function main() {
  assertFixturesAllowed();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient();
  try {
    const samples = [
      {
        productSourceName: 'Bột nếp',
        sku: 'DEMO-BOT-NEP-1KG',
        packLabel: 'TEST túi 1 kg',
        priceVnd: 35_000n,
        costVnd: 22_000n,
        stock: 100n,
      },
      {
        productSourceName: 'Cùi đẹp',
        sku: 'DEMO-CUI-DEP-500G',
        packLabel: 'TEST túi 500 g',
        netWeightG: 500,
        priceVnd: 48_000n,
        costVnd: 30_000n,
        stock: 40n,
      },
      {
        productSourceName: 'Trân châu đen',
        sku: 'DEMO-TRAN-CHAU-1KG',
        packLabel: 'TEST gói 1 kg',
        priceVnd: 52_000n,
        costVnd: 33_000n,
        stock: 1n,
      },
    ];
    for (const s of samples) {
      const exists = await prisma.productVariant.findUnique({ where: { sku: `TEST-${s.sku}` } });
      if (exists) continue;
      await createTestSku(prisma, s);
    }
    await unlockCheckoutForTests(prisma, {
      provinces: ['Hà Nội', 'Hồ Chí Minh'],
      shipping: 'MANUAL_QUOTE',
    });
    console.log(
      'TEST fixtures loaded: 3 TEST SKUs + checkout unlocked for Hà Nội / Hồ Chí Minh (COD, phí ship báo sau).',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
