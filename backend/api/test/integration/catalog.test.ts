import request from 'supertest';
import { createTestApp, loginOwner, type TestApp } from '../helpers/app';

let t: TestApp;
let owner: { auth: string };
beforeAll(async () => {
  t = await createTestApp();
  owner = await loginOwner(t);
});
afterAll(async () => {
  await t.close();
});

describe('public catalog (P1-09): ACTIVE + DRAFT browsable, only ACTIVE sellable', () => {
  it('lists the 8 ACTIVE categories counting the 82 browsable source items', async () => {
    const res = await request(t.server).get('/v1/categories').expect(200);
    expect(res.body.data).toHaveLength(8);
    expect(
      res.body.data.reduce(
        (n: number, c: { activeProductCount: number }) => n + c.activeProductCount,
        0,
      ),
    ).toBe(82);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ slug: 'bot-nau-che-tinh-bot', name: 'Bột nấu chè & tinh bột' }),
    );
    // no leakage of provenance/internal fields
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      'activeProductCount',
      'id',
      'name',
      'slug',
    ]);
  });

  it('lists DRAFT source items as browsable but never sellable', async () => {
    const res = await request(t.server).get('/v1/products').expect(200);
    expect(res.body.meta).toEqual(expect.objectContaining({ page: 1, limit: 24, total: 82 }));
    expect(res.body.data.every((p: { sellable: boolean }) => p.sellable === false)).toBe(true);
  });

  it('search finds DRAFT products and flags them not sellable', async () => {
    const res = await request(t.server).get('/v1/products?search=cui%20zip').expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].sellable).toBe(false);
  });

  it('PDP of a DRAFT product is viewable, not sellable, and has no variants', async () => {
    const res = await request(t.server).get('/v1/products/cui-zip').expect(200);
    expect(res.body.data.sellable).toBe(false);
    expect(res.body.data.variants).toEqual([]);
  });

  it('paused/archived products are hidden', async () => {
    const p = await t.prisma.product.findFirstOrThrow({ where: { sourceName: 'Cùi Zip' } });
    await t.prisma.product.update({ where: { id: p.id }, data: { status: 'PAUSED' } });
    await request(t.server).get('/v1/products/cui-zip').expect(404);
    await t.prisma.product.update({ where: { id: p.id }, data: { status: 'DRAFT' } });
  });

  it('exposes a product publicly only once it is ACTIVE (and hides it again when paused)', async () => {
    // 'Cùi đẹp' (#20) has an illustrative image; 'Cùi Zip' (#21) has none in the prototype.
    const p = await t.prisma.product.findFirstOrThrow({ where: { sourceName: 'Cùi đẹp' } });
    await t.prisma.product.update({ where: { id: p.id }, data: { status: 'ACTIVE' } });
    const list = await request(t.server).get('/v1/products?search=cui%20dep').expect(200);
    expect(list.body.data).toHaveLength(1);
    const item = list.body.data[0];
    expect(item.slug).toBe('cui-dep');
    expect(item.image).toEqual({
      url: expect.stringMatching(/^\/catalog-illustrative\//),
      isIllustrative: true,
    } satisfies object);
    // public DTO has no provenance, cost or status fields
    expect(Object.keys(item).sort()).toEqual([
      'category',
      'id',
      'image',
      'name',
      'sellable',
      'slug',
    ]);
    expect(item.sellable).toBe(true);
    const detail = await request(t.server).get('/v1/products/cui-dep').expect(200);
    expect(detail.body.data.variants).toEqual([]);
    const cats = await request(t.server).get('/v1/categories').expect(200);
    expect(
      cats.body.data.find((c: { slug: string }) => c.slug === 'cui-buoi-phu-lieu')
        .activeProductCount,
    ).toBe(16);

    await t.prisma.product.update({ where: { id: p.id }, data: { status: 'PAUSED' } });
    await request(t.server).get('/v1/products/cui-dep').expect(404);
  });

  it('products without an image return image=null (no fake placeholder from the API)', async () => {
    const p = await t.prisma.product.findFirstOrThrow({ where: { sourceName: 'Cùi Zip' } });
    await t.prisma.product.update({ where: { id: p.id }, data: { status: 'ACTIVE' } });
    const res = await request(t.server).get('/v1/products/cui-zip').expect(200);
    expect(res.body.data.image).toBeNull();
    await t.prisma.product.update({ where: { id: p.id }, data: { status: 'DRAFT' } });
  });

  it('search is diacritic-insensitive and AND-combines tokens', async () => {
    await t.prisma.product.updateMany({
      where: { sourceName: { in: ['Trân châu 3Q trắng', 'Trân châu 3Q đen', 'Trân châu đen'] } },
      data: { status: 'ACTIVE' },
    });
    const a = await request(t.server).get('/v1/products?search=TRÂN CHÂU 3Q').expect(200);
    expect(a.body.data.map((x: { name: string }) => x.name).sort()).toEqual(
      ['Trân châu 3Q trắng', 'Trân châu 3Q đen'].sort(),
    );
    const b = await request(t.server).get('/v1/products?search=tran%20chau%20den').expect(200);
    expect(b.body.meta.total).toBe(2);
    const c = await request(t.server)
      .get('/v1/products?search=tran%20chau&sort=-name&limit=2&page=1')
      .expect(200);
    expect(c.body.data).toHaveLength(2);
    expect(c.body.meta.total).toBe(9);
  });

  it('treats SQL/wildcard characters in search as plain text', async () => {
    const res = await request(t.server)
      .get(`/v1/products?search=${encodeURIComponent("%'; DROP TABLE products;--")}`)
      .expect(200);
    expect(res.body.data).toBeDefined();
    expect(await t.prisma.product.count()).toBe(82);
  });
});

describe('admin catalog (P1-12 backend): all statuses, RBAC protected', () => {
  it('requires authentication', async () => {
    await request(t.server).get('/v1/admin/products').expect(401);
  });

  it('shows all 82 products with source provenance to an authorised admin', async () => {
    const res = await request(t.server)
      .get('/v1/admin/products?limit=100&sort=source_index')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(res.body.meta.total).toBe(82);
    expect(res.body.data).toHaveLength(82);
    const first = res.body.data[0];
    expect(first).toEqual(
      expect.objectContaining({ sourceIndex: 1, sourceName: 'Bột viên', originType: 'UNVERIFIED' }),
    );
    expect(first.media[0]).toEqual(
      expect.objectContaining({ isIllustrative: true, verified: false }),
    );
  });

  it('filters by status/category and paginates', async () => {
    const drafts = await request(t.server)
      .get('/v1/admin/products?status=DRAFT&category=cac-loai-dau-hat')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(drafts.body.meta.total).toBe(4);
    const page = await request(t.server)
      .get('/v1/admin/products?limit=10&page=10')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(page.body.data).toHaveLength(0);
  });

  it('returns product detail by id and 404 for unknown ids; 400 for malformed ids', async () => {
    const p = await t.prisma.product.findFirstOrThrow({ where: { sourceName: 'Bột nếp' } });
    const ok = await request(t.server)
      .get(`/v1/admin/products/${p.id}`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(ok.body.data.sourceName).toBe('Bột nếp');
    await request(t.server)
      .get('/v1/admin/products/00000000-0000-4000-8000-000000000000')
      .set('Authorization', owner.auth)
      .expect(404);
    await request(t.server)
      .get('/v1/admin/products/not-a-uuid')
      .set('Authorization', owner.auth)
      .expect(400);
  });

  it('lists 8 categories with product counts', async () => {
    const res = await request(t.server)
      .get('/v1/admin/categories')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(res.body.data.map((c: { productCount: number }) => c.productCount)).toEqual([
      13, 16, 8, 4, 7, 8, 17, 9,
    ]);
  });
});
