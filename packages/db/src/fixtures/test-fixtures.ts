import type { PrismaClient, StorageClass } from '@prisma/client';

/**
 * TEST-ONLY commerce fixtures (ADR-0009/0013). Prices, costs, stock and pack data below are ARBITRARY
 * test numbers, clearly flagged `is_test`, and are never part of the real catalogue or the seed.
 * Refused when APP_ENV=production. Real SKUs require owner decisions D02/D04.
 */
export interface TestSkuInput {
  /** Exact `source_name` of an existing seeded product (ignored when `productId` is given). */
  productSourceName?: string;
  productId?: string;
  sku: string;
  packLabel?: string;
  netWeightG?: number;
  storageClass?: StorageClass;
  priceVnd?: bigint;
  costVnd?: bigint;
  stock?: bigint;
  minQty?: number;
  maxQty?: number | null;
  /** Make the variant and its product ACTIVE (sellable in tests). Default true. */
  active?: boolean;
  warehouseCode?: string;
}

export function assertFixturesAllowed(): void {
  if (process.env.APP_ENV === 'production') {
    throw new Error('Test fixtures are refused in production');
  }
}

export async function ensureTestWarehouse(prisma: PrismaClient, code = 'TEST-WH') {
  assertFixturesAllowed();
  return prisma.warehouse.upsert({
    where: { code },
    update: {},
    create: { code, name: `Kho thử nghiệm ${code}`, isTest: true },
  });
}

export async function createTestSku(prisma: PrismaClient, input: TestSkuInput) {
  assertFixturesAllowed();
  const product = await prisma.product.findFirstOrThrow({
    where: input.productId
      ? { id: input.productId }
      : { sourceName: input.productSourceName ?? '' },
  });
  const warehouse = await ensureTestWarehouse(prisma, input.warehouseCode);
  const active = input.active ?? true;
  const now = new Date(Date.now() - 60_000);
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: input.sku.startsWith('TEST-') ? input.sku : `TEST-${input.sku}`,
      packLabel: input.packLabel ?? 'TEST gói 1 kg',
      sellableUnit: 'goi',
      netWeightG: input.netWeightG ?? 1000,
      storageClass: input.storageClass ?? 'DRY',
      minQty: input.minQty ?? 1,
      maxQty: input.maxQty ?? null,
      manufacturer: 'TEST',
      responsibleEntity: 'TEST',
      status: active ? 'ACTIVE' : 'DRAFT',
      isTest: true,
    },
  });
  if (input.priceVnd !== undefined) {
    await prisma.priceRule.create({
      data: {
        variantId: variant.id,
        channel: 'RETAIL',
        minQty: 1,
        unitPriceVnd: input.priceVnd,
        validFrom: now,
      },
    });
  }
  if (input.costVnd !== undefined) {
    await prisma.supplierCost.create({
      data: { variantId: variant.id, costVnd: input.costVnd, validFrom: now },
    });
  }
  const stock = input.stock ?? 0n;
  await prisma.inventoryBalance.create({
    data: { warehouseId: warehouse.id, variantId: variant.id, onHand: stock },
  });
  if (stock > 0n) {
    await prisma.stockMovement.create({
      data: {
        warehouseId: warehouse.id,
        variantId: variant.id,
        type: 'RECEIPT',
        qty: stock,
        reasonCode: 'TEST_FIXTURE',
      },
    });
  }
  if (active && product.status !== 'ACTIVE') {
    await prisma.product.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });
  }
  return { variant, warehouse };
}

/** Settings that unlock checkout for TEST SKUs only (what the owner would configure after D01/D05/D06/D14). */
export async function unlockCheckoutForTests(
  prisma: PrismaClient,
  opts: {
    provinces?: string[];
    chilledProvinces?: string[];
    shipping?: 'BLOCK' | 'MANUAL_QUOTE';
  } = {},
): Promise<void> {
  assertFixturesAllowed();
  const entries: Record<string, unknown> = {
    'flags.cod_enabled': true,
    'checkout.shipping_policy': opts.shipping ?? 'MANUAL_QUOTE',
    'checkout.tax_policy': 'INCLUSIVE',
    'delivery.allowed_provinces': opts.provinces ?? ['Hà Nội'],
    'delivery.chilled_provinces': opts.chilledProvinces ?? [],
  };
  for (const [key, value] of Object.entries(entries)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }
}
