import { PrismaClient } from '@prisma/client';
import { FACTORY_FORBIDDEN_PERMISSIONS, PERMISSIONS, ROLE_PERMISSIONS } from '@bizgo/shared';
import { seedAll } from '../src';
import { cloneTestDatabase } from '../testing';

let prisma: PrismaClient;
let drop: () => Promise<void>;

beforeAll(async () => {
  const db = await cloneTestDatabase();
  drop = db.drop;
  prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

describe('M001 migration + seed (real PostgreSQL)', () => {
  it('seeds 8 categories and 82 products, all DRAFT/UNVERIFIED', async () => {
    const report = await seedAll(prisma);
    expect(report.categories).toBe(8);
    expect(report.products).toBe(82);

    expect(await prisma.category.count()).toBe(8);
    expect(await prisma.product.count()).toBe(82);
    expect(await prisma.product.count({ where: { status: { not: 'DRAFT' } } })).toBe(0);
    expect(await prisma.product.count({ where: { originType: { not: 'UNVERIFIED' } } })).toBe(0);

    const perCategory = await prisma.product.groupBy({ by: ['categoryId'], _count: true });
    expect(perCategory.map((c) => c._count).sort((a, b) => a - b)).toEqual([
      4, 7, 8, 8, 9, 13, 16, 17,
    ]);
  });

  it('is idempotent: a second run creates nothing new', async () => {
    const before = {
      products: await prisma.product.count(),
      aliases: await prisma.searchAlias.count(),
      media: await prisma.productMedia.count(),
    };
    const report = await seedAll(prisma);
    expect(report.newProducts).toBe(0);
    expect(await prisma.product.count()).toBe(before.products);
    expect(await prisma.searchAlias.count()).toBe(before.aliases);
    expect(await prisma.productMedia.count()).toBe(before.media);
  });

  it('preserves source columns verbatim and strips LaTeX only for display', async () => {
    const p = await prisma.product.findFirstOrThrow({ where: { sourceName: 'Cốm xanh bao 5kg' } });
    expect(p.sourceNoteRaw).toBe('Quy cách $5\\text{ kg}$/bao');
    expect(p.displayNote).toBe('Quy cách 5 kg/bao');
    expect(p.sourceUnitText).toBe('Bao / Bì');
  });

  it('links 77 illustrative images, none verified', async () => {
    expect(await prisma.productMedia.count()).toBe(77);
    expect(await prisma.productMedia.count({ where: { isIllustrative: false } })).toBe(0);
    expect(await prisma.productMedia.count({ where: { verifiedAt: { not: null } } })).toBe(0);
  });

  it('adds parenthetical source aliases and normalised search text', async () => {
    const p = await prisma.product.findFirstOrThrow({
      where: { sourceName: 'Cùi phớt hồng (Trắng bánh tẻ)' },
      include: { aliases: true },
    });
    expect(p.aliases.map((a) => a.aliasNorm)).toContain('trang banh te');
    expect(p.searchText).toContain('cui phot hong');
  });

  it('generates unique ascii slugs', async () => {
    const slugs = (await prisma.product.findMany({ select: { slug: true } })).map((s) => s.slug);
    expect(new Set(slugs).size).toBe(82);
    expect(slugs.every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))).toBe(true);
  });

  it('DB trigger blocks changing immutable source columns but allows editorial fields', async () => {
    const p = await prisma.product.findFirstOrThrow({ where: { sourceName: 'Bột viên' } });
    await expect(
      prisma.product.update({ where: { id: p.id }, data: { sourceName: 'Bột viên X' } }),
    ).rejects.toThrow(/immutable/);
    const ok = await prisma.product.update({
      where: { id: p.id },
      data: { displayName: 'Bột viên (biên tập)' },
    });
    expect(ok.displayName).toBe('Bột viên (biên tập)');
    expect(ok.sourceName).toBe('Bột viên');
  });

  it('audit_logs is append-only (UPDATE, DELETE and TRUNCATE rejected)', async () => {
    const row = await prisma.auditLog.create({
      data: { action: 'test.write', entityType: 'test', entityId: '1' },
    });
    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { action: 'x' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"')).rejects.toThrow(
      /append-only/,
    );
    expect(await prisma.auditLog.count({ where: { id: row.id } })).toBe(1);
  });

  it('rejects malformed slugs via CHECK constraint', async () => {
    const cat = await prisma.category.findFirstOrThrow();
    await expect(
      prisma.product.create({
        data: {
          categoryId: cat.id,
          sourceIndex: 9999,
          sourceName: 'x',
          sourceUnitText: '',
          sourceNoteRaw: '',
          displayNote: '',
          displayName: 'x',
          slug: 'Bad Slug!',
          searchText: 'x',
        },
      }),
    ).rejects.toThrow();
  });

  it('seeds RBAC exactly from the shared table; factory roles hold no finance permissions', async () => {
    expect(await prisma.permission.count()).toBe(PERMISSIONS.length);
    for (const code of ['FACTORY_MANAGER', 'FACTORY_STAFF'] as const) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { code },
        include: { permissions: { include: { permission: true } } },
      });
      const granted = role.permissions.map((rp) => rp.permission.code).sort();
      expect(granted).toEqual([...ROLE_PERMISSIONS[code]].sort());
      for (const forbidden of FACTORY_FORBIDDEN_PERMISSIONS)
        expect(granted).not.toContain(forbidden);
    }
  });

  it('seeds every blocked-decision feature flag as false and never overwrites an owner change', async () => {
    const flags = await prisma.setting.findMany({ where: { key: { startsWith: 'flags.' } } });
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.value === false)).toBe(true);
    await prisma.setting.update({ where: { key: 'flags.cod_enabled' }, data: { value: true } });
    await seedAll(prisma);
    const cod = await prisma.setting.findUniqueOrThrow({ where: { key: 'flags.cod_enabled' } });
    expect(cod.value).toBe(true);
  });

  it('keeps pg_trgm search working over normalised text', async () => {
    const rows = await prisma.$queryRaw<{ source_name: string }[]>`
      SELECT source_name FROM products WHERE search_text LIKE ${'%tran chau 3q%'} ORDER BY source_index`;
    expect(rows.map((r) => r.source_name)).toEqual(['Trân châu 3Q trắng', 'Trân châu 3Q đen']);
  });
});
