import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  PERMISSIONS,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  normalizeVi,
  slugify,
  stripLatexResidue,
} from '@bizgo/shared';
import { findRepoRoot } from '../repo-root';
import {
  CATEGORY_DISPLAY_NAMES,
  assertCatalogInvariants,
  parseCatalogCsv,
  type SourceRow,
} from './catalog-source';

export interface SeedOptions {
  /** Defaults to <repo>/docs/catalog_source_82.csv */
  catalogCsvPath?: string;
  /** Defaults to <repo>/source/BizGo_Responsive_Web_Demo/data.json (image mapping only) */
  prototypeDataPath?: string;
  /** Public URL prefix under which the storefront serves the illustrative images. */
  illustrativeMediaPrefix?: string;
}

export interface SeedReport {
  categories: number;
  products: number;
  newProducts: number;
  aliases: number;
  media: number;
  roles: number;
  permissions: number;
}

const ROLE_NAMES: Record<string, string> = {
  OWNER: 'Chủ sở hữu BizGo',
  SALES_CS: 'Sale / CSKH',
  ACCOUNTANT: 'Kế toán',
  WAREHOUSE: 'Thủ kho',
  FACTORY_MANAGER: 'Quản lý xưởng',
  FACTORY_STAFF: 'Nhân viên xưởng',
  CUSTOMER: 'Khách hàng',
  WHOLESALE_CUSTOMER: 'Khách sỉ / đại lý',
};

/** Safe defaults for every BLOCKED_DECISION flag (ADR-0013). Never overwritten once present. */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  'flags.guest_checkout_enabled': false,
  'flags.bank_transfer_enabled': false,
  'flags.cod_enabled': false,
  'flags.payment_gateway_enabled': false,
  'flags.carrier_api_enabled': false,
  'flags.wholesale_enabled': false,
  'flags.account_deletion_enabled': false,
  'flags.public_catalog_show_draft_as_contact': false,
};

export async function seedRbac(
  prisma: PrismaClient,
): Promise<{ roles: number; permissions: number }> {
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_NAMES[code] ?? code },
      create: { code, name: ROLE_NAMES[code] ?? code },
    });
    const wanted = new Set(ROLE_PERMISSIONS[code]);
    const existing = await prisma.rolePermission.findMany({ where: { roleId: role.id } });
    const permById = new Map([...perms].map(([c, id]) => [id, c]));
    const toRemove = existing.filter((rp) => !wanted.has(permById.get(rp.permissionId) as never));
    if (toRemove.length) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: toRemove.map((r) => r.permissionId) } },
      });
    }
    await prisma.rolePermission.createMany({
      data: [...wanted].map((p) => ({ roleId: role.id, permissionId: perms.get(p) as string })),
      skipDuplicates: true,
    });
  }
  return { roles: ROLE_CODES.length, permissions: PERMISSIONS.length };
}

export async function seedSettings(prisma: PrismaClient): Promise<void> {
  await prisma.setting.createMany({
    data: Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value: value as never })),
    skipDuplicates: true,
  });
}

function aliasesFromName(sourceName: string): string[] {
  const out: string[] = [];
  const m = sourceName.match(/\(([^)]+)\)/);
  if (m?.[1]) out.push(m[1].trim());
  return out;
}

export async function seedCatalog(
  prisma: PrismaClient,
  opts: SeedOptions = {},
): Promise<Pick<SeedReport, 'categories' | 'products' | 'newProducts' | 'aliases' | 'media'>> {
  const root = findRepoRoot();
  const csvPath = opts.catalogCsvPath ?? join(root, 'docs', 'catalog_source_82.csv');
  const dataPath =
    opts.prototypeDataPath ?? join(root, 'source', 'BizGo_Responsive_Web_Demo', 'data.json');
  const prefix = opts.illustrativeMediaPrefix ?? '/catalog-illustrative';

  const rows: SourceRow[] = parseCatalogCsv(readFileSync(csvPath, 'utf-8'));
  assertCatalogInvariants(rows);

  let imageById = new Map<number, string | null>();
  try {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8')) as {
      id: number;
      image: string | null;
    }[];
    imageById = new Map(data.map((d) => [d.id, d.image]));
  } catch {
    // Image mapping is optional; products simply have no media rows.
  }

  // Categories in first-appearance order.
  const categoryOrder: string[] = [];
  for (const r of rows)
    if (!categoryOrder.includes(r.categorySource)) categoryOrder.push(r.categorySource);

  const categoryIdBySource = new Map<string, string>();
  for (let i = 0; i < categoryOrder.length; i++) {
    const sourceName = categoryOrder[i] as string;
    const displayName = CATEGORY_DISPLAY_NAMES[i] as string;
    const cat = await prisma.category.upsert({
      where: { sourceName },
      update: {},
      // Categories are navigation labels from the source list, so they are ACTIVE; products stay DRAFT.
      create: {
        sourceName,
        displayName,
        slug: slugify(displayName),
        sortOrder: i + 1,
        status: 'ACTIVE',
      },
    });
    categoryIdBySource.set(sourceName, cat.id);
  }

  const usedSlugs = new Set(
    (await prisma.product.findMany({ select: { slug: true } })).map((p) => p.slug),
  );
  let newProducts = 0;
  let aliasCount = 0;
  let mediaCount = 0;

  for (const r of rows) {
    const categoryId = categoryIdBySource.get(r.categorySource) as string;
    let product = await prisma.product.findUnique({
      where: { categoryId_sourceIndex: { categoryId, sourceIndex: r.sourceIndex } },
    });
    const aliases = [r.sourceName, ...aliasesFromName(r.sourceName)];
    if (!product) {
      let slug = slugify(r.sourceName);
      if (usedSlugs.has(slug)) slug = `${slug}-${r.sourceIndex}`;
      usedSlugs.add(slug);
      const displayNote = stripLatexResidue(r.sourceNote);
      product = await prisma.product.create({
        data: {
          categoryId,
          sourceIndex: r.sourceIndex,
          sourceName: r.sourceName,
          sourceUnitText: r.sourceUnit,
          sourceNoteRaw: r.sourceNote,
          displayNote,
          displayName: r.sourceName, // editorial display_name is curated later by the owner
          slug,
          originType: 'UNVERIFIED',
          status: 'DRAFT',
          searchText: normalizeVi(
            Array.from(new Set([r.sourceName, ...aliasesFromName(r.sourceName)])).join(' '),
          ),
        },
      });
      newProducts++;
    }
    const aliasData = Array.from(new Set(aliases.map((a) => normalizeVi(a)))).map((norm) => ({
      productId: product.id,
      alias: aliases.find((a) => normalizeVi(a) === norm) as string,
      aliasNorm: norm,
    }));
    const a = await prisma.searchAlias.createMany({ data: aliasData, skipDuplicates: true });
    aliasCount += a.count;

    const image = imageById.get(r.sourceIndex);
    if (image) {
      const file = image.split('/').pop() as string;
      const m = await prisma.productMedia.createMany({
        data: [{ productId: product.id, storageKey: `${prefix}/${file}`, isIllustrative: true }],
        skipDuplicates: true,
      });
      mediaCount += m.count;
    }
  }

  return {
    categories: categoryOrder.length,
    products: rows.length,
    newProducts,
    aliases: aliasCount,
    media: mediaCount,
  };
}

export async function seedAll(prisma: PrismaClient, opts: SeedOptions = {}): Promise<SeedReport> {
  if (process.env.APP_ENV === 'production' && process.env.SEED_TEST_FIXTURES === 'true') {
    throw new Error('Refusing to seed test fixtures in production');
  }
  const rbac = await seedRbac(prisma);
  await seedSettings(prisma);
  const catalog = await seedCatalog(prisma, opts);
  return { ...catalog, ...rbac };
}
