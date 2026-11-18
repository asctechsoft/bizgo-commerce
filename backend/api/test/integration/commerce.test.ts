import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app';
import {
  ADDRESS,
  PW,
  allKeys,
  idemKey,
  newCustomer,
  newSku,
  ownerSession,
  place,
  quote,
  unlock,
} from '../helpers/commerce';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const reservedOf = async (variantId: string) =>
  (await t.prisma.inventoryBalance.findFirstOrThrow({ where: { variantId } })).reserved;
const onHandOf = async (variantId: string) =>
  (await t.prisma.inventoryBalance.findFirstOrThrow({ where: { variantId } })).onHand;

describe('checkout is fail-closed until the owner answers D01/D05/D06/D14', () => {
  it('default settings block checkout: null total, explicit blockers, no order possible', async () => {
    const { variant } = await newSku(t, { sku: 'GATE-1' });
    const c = await newCustomer(t);
    const res = await quote(t, c, [{ variantId: variant.id, quantity: 1 }]).then((r) => r);
    expect(res.status).toBe(200);
    const q = res.body.data;
    expect(q.canPlaceOrder).toBe(false);
    expect(q.totalVnd).toBeNull();
    expect(q.shippingFeeVnd).toBeNull();
    expect(q.blockers.map((b: { code: string }) => b.code).sort()).toEqual([
      'DELIVERY_UNSUPPORTED',
      'SHIPPING_FEE_UNDETERMINED',
      'TAX_POLICY_UNDETERMINED',
    ]);
    const order = await place(t, c, { quoteId: q.quoteId, version: q.version });
    expect(order.status).toBeGreaterThanOrEqual(400);
    expect(await t.prisma.order.count()).toBe(0);
    expect(await reservedOf(variant.id)).toBe(0n);
  });

  it('a DRAFT product/variant can never enter a cart or be sold', async () => {
    const { variant } = await newSku(t, { sku: 'DRAFT-1', active: false });
    const c = await newCustomer(t);
    const add = await request(t.server)
      .post('/v1/cart/items')
      .set('Authorization', c.auth)
      .send({ variantId: variant.id, quantity: 1 });
    expect(add.status).toBe(422);
    expect(add.body.code).toBe('SKU_NOT_READY');
    const q = await quote(t, c, [{ variantId: variant.id, quantity: 1 }]);
    expect(q.body.data.blockers.map((b: { code: string }) => b.code)).toContain('SKU_NOT_READY');
  });
});

describe('happy path (after owner configuration)', () => {
  let variantId: string;
  beforeAll(async () => {
    await unlock(t);
    variantId = (await newSku(t, { sku: 'OK-1', priceVnd: 50_000n, stock: 100n })).variant.id;
  });

  it('cart → quote → idempotent order with a REAL stock hold, COD unpaid, outbox + audit', async () => {
    const c = await newCustomer(t);
    await request(t.server)
      .post('/v1/cart/items')
      .set('Authorization', c.auth)
      .send({ variantId, quantity: 2 })
      .expect(201);
    await request(t.server)
      .post('/v1/cart/items')
      .set('Authorization', c.auth)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const cart = await request(t.server).get('/v1/cart').set('Authorization', c.auth).expect(200);
    expect(cart.body.data.items).toHaveLength(1);
    expect(cart.body.data.items[0]).toEqual(
      expect.objectContaining({ quantity: 3, unitPriceVnd: 50_000, available: true }),
    );
    expect(cart.body.data.note).toBe('ESTIMATE_ONLY');

    // quote from the server cart (client supplies no price anywhere)
    const qres = await request(t.server)
      .post('/v1/checkout/quote')
      .set('Authorization', c.auth)
      .send({ addressId: c.addressId })
      .expect(200);
    const q = qres.body.data;
    expect(q).toEqual(
      expect.objectContaining({
        canPlaceOrder: true,
        subtotalVnd: 150_000,
        totalVnd: 150_000,
        shippingFeeVnd: null,
        shippingNote: 'MANUAL_QUOTE',
        currency: 'VND',
      }),
    );

    const before = await reservedOf(variantId);
    const ord = await place(t, c, { quoteId: q.quoteId, version: q.version });
    expect(ord.status).toBe(201);
    expect(ord.body.data).toEqual(
      expect.objectContaining({
        status: 'PENDING_CONFIRMATION',
        paymentStatus: 'PENDING',
        paymentMethod: 'COD',
        totalVnd: 150_000,
        isTest: true,
      }),
    );
    expect(ord.body.data.orderNumber).toMatch(/^BG-\d{6}-[A-Z2-9]{6}$/);

    expect((await reservedOf(variantId)) - before).toBe(3n);
    const id = ord.body.data.id as string;
    const reservation = await t.prisma.inventoryReservation.findMany({ where: { orderId: id } });
    expect(reservation).toHaveLength(1);
    expect(reservation[0]).toEqual(expect.objectContaining({ status: 'HELD', qty: 3n }));
    expect(
      await t.prisma.stockMovement.count({
        where: { refType: 'order', refId: id, type: 'RESERVE' },
      }),
    ).toBe(1);
    expect(
      await t.prisma.outboxEvent.count({ where: { type: 'order.created', aggregateId: id } }),
    ).toBe(1);
    expect(
      await t.prisma.auditLog.count({ where: { action: 'order.created', entityId: id } }),
    ).toBe(1);
    const pay = await t.prisma.payment.findFirstOrThrow({ where: { orderId: id } });
    expect(pay.status).toBe('PENDING'); // COD is never paid at creation
    expect(await t.prisma.orderStatusEvent.count({ where: { orderId: id } })).toBe(1);
  });

  it('customer sees only own orders; response never contains cost, margin or supplier data', async () => {
    const a = await newCustomer(t);
    const b = await newCustomer(t);
    const q = (await quote(t, a, [{ variantId, quantity: 1 }])).body.data;
    const o = (await place(t, a, { quoteId: q.quoteId, version: q.version })).body.data;

    const detail = await request(t.server)
      .get(`/v1/me/orders/${o.id}`)
      .set('Authorization', a.auth)
      .expect(200);
    const keys = [...allKeys(detail.body)].map((k) => k.toLowerCase());
    for (const bad of ['cost', 'margin', 'supplier', 'financial', 'expectedmargin']) {
      expect(keys.some((k) => k.includes(bad))).toBe(false);
    }
    expect(detail.body.data.items[0]).toEqual(
      expect.objectContaining({ unitPriceVnd: 50_000, quantity: 1 }),
    );
    expect(detail.body.data.timeline).toHaveLength(1);

    const list = await request(t.server)
      .get('/v1/me/orders')
      .set('Authorization', a.auth)
      .expect(200);
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(o.id);
    expect(
      (await request(t.server).get('/v1/me/orders').set('Authorization', b.auth)).body.data,
    ).toEqual([]);

    // UAT-05: customer B cannot read, cancel or reuse customer A's data (404, not 403: no existence leak)
    await request(t.server).get(`/v1/me/orders/${o.id}`).set('Authorization', b.auth).expect(404);
    await request(t.server)
      .post(`/v1/me/orders/${o.id}/cancel`)
      .set('Authorization', b.auth)
      .set('Idempotency-Key', idemKey())
      .expect(404);
    const foreignQuote = await place(t, b, { quoteId: q.quoteId, version: q.version });
    expect(foreignQuote.status).toBe(404);
    expect(
      await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } }).then((x) => x.status),
    ).toBe('PENDING_CONFIRMATION');
  });

  it('payment method flags: BANK_TRANSFER stays disabled until D06', async () => {
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId, quantity: 1 }])).body.data;
    const r = await place(
      t,
      c,
      { quoteId: q.quoteId, version: q.version },
      idemKey(),
      'BANK_TRANSFER',
    );
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('FEATURE_DISABLED');
  });

  it('requires an Idempotency-Key and validates the body', async () => {
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId, quantity: 1 }])).body.data;
    const noKey = await request(t.server)
      .post('/v1/orders')
      .set('Authorization', c.auth)
      .send({ checkoutQuoteId: q.quoteId, acceptedQuoteVersion: q.version, paymentMethod: 'COD' });
    expect(noKey.status).toBe(400);
    const badBody = await place(t, c, { quoteId: 'nope', version: 1 });
    expect(badBody.status).toBe(400);
    const shortKey = await place(t, c, { quoteId: q.quoteId, version: q.version }, 'short');
    expect(shortKey.status).toBe(400);
  });

  it('quotes expire (TTL) and cannot back two orders', async () => {
    const c = await newCustomer(t);
    const q1 = (await quote(t, c, [{ variantId, quantity: 1 }])).body.data;
    const first = await place(t, c, { quoteId: q1.quoteId, version: q1.version });
    expect(first.status).toBe(201);
    const reuse = await place(t, c, { quoteId: q1.quoteId, version: q1.version }, idemKey());
    expect(reuse.status).toBe(422);
    expect(reuse.body.code).toBe('QUOTE_EXPIRED');

    const q2 = (await quote(t, c, [{ variantId, quantity: 1 }])).body.data;
    t.clock.advance(14 * 60 * 1000); // inside the 15 min TTL (session access token is 15 min too)
    const ok = await place(t, c, { quoteId: q2.quoteId, version: q2.version });
    expect(ok.status).toBe(201);

    const q3 = (await quote(t, c, [{ variantId, quantity: 1 }])).body.data;
    t.clock.advance(15 * 60 * 1000 + 1000);
    const relog = await t.login(c.identity, PW);
    const expired = await request(t.server)
      .post('/v1/orders')
      .set('Authorization', relog.auth)
      .set('Idempotency-Key', idemKey())
      .send({
        checkoutQuoteId: q3.quoteId,
        acceptedQuoteVersion: q3.version,
        paymentMethod: 'COD',
      });
    expect(expired.status).toBe(422);
    expect(expired.body.code).toBe('QUOTE_EXPIRED');
  });
});

describe('UAT-03 double-click / network retry ⇒ exactly one order', () => {
  it('12 parallel submits with the same key create one order, one hold, one outbox event', async () => {
    await unlock(t);
    const { variant } = await newSku(t, { sku: 'DBL-1', stock: 50n });
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId: variant.id, quantity: 4 }])).body.data;
    const key = idemKey('dbl');
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        place(t, c, { quoteId: q.quoteId, version: q.version }, key),
      ),
    );
    const created = results.filter((r) => r.status === 201);
    const inProgress = results.filter(
      (r) => r.status === 409 && r.body.code === 'IDEMPOTENCY_IN_PROGRESS',
    );
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(created.length + inProgress.length).toBe(12);
    expect(new Set(created.map((r) => r.body.data.id)).size).toBe(1);
    expect(await t.prisma.order.count({ where: { userId: c.userId } })).toBe(1);
    expect(await reservedOf(variant.id)).toBe(4n);
    expect(await t.prisma.inventoryReservation.count({ where: { variantId: variant.id } })).toBe(1);

    const replay = await place(t, c, { quoteId: q.quoteId, version: q.version }, key);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(created[0]?.body.data.id);
    expect(await reservedOf(variant.id)).toBe(4n);
    const different = await request(t.server)
      .post('/v1/orders')
      .set('Authorization', c.auth)
      .set('Idempotency-Key', key)
      .send({
        checkoutQuoteId: q.quoteId,
        acceptedQuoteVersion: q.version,
        paymentMethod: 'BANK_TRANSFER',
      });
    expect(different.status).toBe(409);
    expect(different.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('UAT-01 overselling is impossible (real PostgreSQL, parallel requests)', () => {
  it('two buyers, stock 1 ⇒ exactly one order; the loser gets OUT_OF_STOCK', async () => {
    await unlock(t);
    const { variant } = await newSku(t, { sku: 'LAST-1', stock: 1n });
    const [a, b] = await Promise.all([newCustomer(t), newCustomer(t)]);
    const qa = (await quote(t, a, [{ variantId: variant.id, quantity: 1 }])).body.data;
    const qb = (await quote(t, b, [{ variantId: variant.id, quantity: 1 }])).body.data;
    expect(qa.canPlaceOrder && qb.canPlaceOrder).toBe(true); // both saw stock when quoting
    const [ra, rb] = await Promise.all([
      place(t, a, { quoteId: qa.quoteId, version: qa.version }),
      place(t, b, { quoteId: qb.quoteId, version: qb.version }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.code).toBe('OUT_OF_STOCK');
    expect(await reservedOf(variant.id)).toBe(1n);
    expect(await onHandOf(variant.id)).toBe(1n);
    expect(
      await t.prisma.order.count({ where: { items: { some: { variantId: variant.id } } } }),
    ).toBe(1);
    expect(
      await t.prisma.inventoryReservation.count({
        where: { variantId: variant.id, status: 'HELD' },
      }),
    ).toBe(1);
  });

  it('10 buyers, stock 3 ⇒ exactly 3 orders succeed, 7 fail, reserved == 3, never negative availability', async () => {
    await unlock(t);
    const { variant } = await newSku(t, { sku: 'RACE-3', stock: 3n });
    const buyers = await Promise.all(Array.from({ length: 10 }, () => newCustomer(t)));
    const quotes = await Promise.all(
      buyers.map((b) =>
        quote(t, b, [{ variantId: variant.id, quantity: 1 }]).then((r) => r.body.data),
      ),
    );
    const results = await Promise.all(
      buyers.map((b, i) => place(t, b, { quoteId: quotes[i].quoteId, version: quotes[i].version })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409 && r.body.code === 'OUT_OF_STOCK')).toHaveLength(
      7,
    );
    const bal = await t.prisma.inventoryBalance.findFirstOrThrow({
      where: { variantId: variant.id },
    });
    expect(bal.reserved).toBe(3n);
    expect(bal.onHand - bal.reserved - bal.quarantined).toBe(0n);
    expect(
      await t.prisma.order.count({ where: { items: { some: { variantId: variant.id } } } }),
    ).toBe(3);
  });

  it('multi-item orders in opposite line order do not deadlock and stay consistent', async () => {
    await unlock(t);
    const [x, y] = await Promise.all([
      newSku(t, { sku: 'MIX-X', stock: 20n }),
      newSku(t, { sku: 'MIX-Y', stock: 20n }),
    ]);
    const buyers = await Promise.all(Array.from({ length: 8 }, () => newCustomer(t)));
    const items = (flip: boolean) => {
      const a = { variantId: x.variant.id, quantity: 1 };
      const b = { variantId: y.variant.id, quantity: 1 };
      return flip ? [b, a] : [a, b];
    };
    const quotes = await Promise.all(
      buyers.map((b, i) => quote(t, b, items(i % 2 === 1)).then((r) => r.body.data)),
    );
    const results = await Promise.all(
      buyers.map((b, i) => place(t, b, { quoteId: quotes[i].quoteId, version: quotes[i].version })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await reservedOf(x.variant.id)).toBe(8n);
    expect(await reservedOf(y.variant.id)).toBe(8n);
  });

  it('DB-level safety net: the ledger CHECK rejects over-reservation and negative stock', async () => {
    const { variant, warehouse } = await newSku(t, { sku: 'CHECK-1', stock: 2n });
    await expect(
      t.prisma.$executeRawUnsafe(
        `UPDATE inventory_balances SET reserved = 3 WHERE variant_id = '${variant.id}'::uuid`,
      ),
    ).rejects.toThrow(/inventory_balances_cover_ck|check/i);
    await expect(
      t.prisma.$executeRawUnsafe(
        `UPDATE inventory_balances SET on_hand = -1 WHERE variant_id = '${variant.id}'::uuid AND warehouse_id = '${warehouse.id}'::uuid`,
      ),
    ).rejects.toThrow();
  });
});

describe('UAT-02 price change between quote and order', () => {
  it('fails with PRICE_CHANGED, creates nothing, returns a fresh quote that can then be accepted', async () => {
    await unlock(t);
    const { variant } = await newSku(t, { sku: 'PRICE-1', priceVnd: 50_000n, stock: 10n });
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId: variant.id, quantity: 2 }])).body.data;
    expect(q.totalVnd).toBe(100_000);

    // owner raises the price: close the old window, open a new one (no overlap allowed)
    const now = t.clock.now();
    await t.prisma.priceRule.updateMany({
      where: { variantId: variant.id },
      data: { validTo: now },
    });
    await t.prisma.priceRule.create({
      data: {
        variantId: variant.id,
        channel: 'RETAIL',
        minQty: 1,
        unitPriceVnd: 60_000n,
        validFrom: now,
      },
    });

    const r = await place(t, c, { quoteId: q.quoteId, version: q.version });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PRICE_CHANGED');
    const detail = r.body.details[0];
    expect(detail.newTotalVnd).toBe(120_000);
    expect(await t.prisma.order.count({ where: { userId: c.userId } })).toBe(0);
    expect(await reservedOf(variant.id)).toBe(0n);

    const retry = await place(t, c, {
      quoteId: detail.newQuoteId,
      version: detail.newQuoteVersion,
    });
    expect(retry.status).toBe(201);
    expect(retry.body.data.totalVnd).toBe(120_000);
  });

  it('UAT-12: an existing order keeps its price/cost snapshot when list price and cost change later', async () => {
    await unlock(t);
    const { variant } = await newSku(t, {
      sku: 'SNAP-1',
      priceVnd: 40_000n,
      costVnd: 25_000n,
      stock: 10n,
    });
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId: variant.id, quantity: 1 }])).body.data;
    const o = (await place(t, c, { quoteId: q.quoteId, version: q.version })).body.data;
    const now = t.clock.now();
    await t.prisma.priceRule.updateMany({
      where: { variantId: variant.id },
      data: { validTo: now },
    });
    await t.prisma.priceRule.create({
      data: {
        variantId: variant.id,
        channel: 'RETAIL',
        minQty: 1,
        unitPriceVnd: 99_000n,
        validFrom: now,
      },
    });
    await t.prisma.supplierCost.updateMany({
      where: { variantId: variant.id },
      data: { validTo: now },
    });
    await t.prisma.supplierCost.create({
      data: { variantId: variant.id, costVnd: 90_000n, validFrom: now },
    });

    const detail = await request(t.server)
      .get(`/v1/me/orders/${o.id}`)
      .set('Authorization', c.auth)
      .expect(200);
    expect(detail.body.data.items[0].unitPriceVnd).toBe(40_000);
    const fin = await t.prisma.orderFinancial.findUniqueOrThrow({ where: { orderId: o.id } });
    expect(fin.costSnapshotVnd).toBe(25_000n);
    expect(fin.expectedMarginVnd).toBe(15_000n);
    // and the database itself refuses to rewrite the snapshot
    await expect(
      t.prisma.orderItem.updateMany({ where: { orderId: o.id }, data: { unitPriceVnd: 1n } }),
    ).rejects.toThrow(/immutable/);
  });
});

describe('UAT-07 cold-chain / unsupported delivery is blocked, never invented', () => {
  it('chilled SKU to a province outside the chilled list cannot be ordered', async () => {
    await unlock(t, { provinces: ['Hà Nội', 'Hải Phòng'], chilledProvinces: ['Hà Nội'] });
    const { variant } = await newSku(t, { sku: 'COLD-1', storageClass: 'CHILLED', stock: 5n });
    const hn = await newCustomer(t, 'Hà Nội');
    const hp = await newCustomer(t, 'Hải Phòng');
    const okQ = (await quote(t, hn, [{ variantId: variant.id, quantity: 1 }])).body.data;
    expect(okQ.canPlaceOrder).toBe(true);
    const badQ = (await quote(t, hp, [{ variantId: variant.id, quantity: 1 }])).body.data;
    expect(badQ.canPlaceOrder).toBe(false);
    expect(badQ.blockers.map((b: { code: string }) => b.code)).toContain('DELIVERY_UNSUPPORTED');
    expect(badQ.shippingFeeVnd).toBeNull();
    const r = await place(t, hp, { quoteId: badQ.quoteId, version: badQ.version });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('DELIVERY_UNSUPPORTED');
    await unlock(t); // restore defaults for later tests
  });
});

describe('UAT-08 cancellation releases stock exactly once', () => {
  let variantId: string;
  beforeAll(async () => {
    await unlock(t);
    variantId = (await newSku(t, { sku: 'CXL-1', stock: 30n })).variant.id;
  });

  it('customer cancels a pending order: CANCELLED, hold released once, replay and re-cancel do not double-release', async () => {
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId, quantity: 5 }])).body.data;
    const o = (await place(t, c, { quoteId: q.quoteId, version: q.version })).body.data;
    const before = await reservedOf(variantId);
    expect(before).toBeGreaterThanOrEqual(5n);

    const key = idemKey('cxl');
    const cancelled = await request(t.server)
      .post(`/v1/me/orders/${o.id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', key)
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(await reservedOf(variantId)).toBe(before - 5n);

    const replay = await request(t.server)
      .post(`/v1/me/orders/${o.id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', key)
      .expect(200);
    expect(replay.body.data.status).toBe('CANCELLED');
    const again = await request(t.server)
      .post(`/v1/me/orders/${o.id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .expect(409);
    expect(again.body.code).toBe('INVALID_STATE_TRANSITION');
    expect(await reservedOf(variantId)).toBe(before - 5n); // not released twice

    expect(await t.prisma.stockMovement.count({ where: { refId: o.id, type: 'RELEASE' } })).toBe(1);
    const res = await t.prisma.inventoryReservation.findMany({ where: { orderId: o.id } });
    expect(res.every((r) => r.status === 'RELEASED')).toBe(true);
    expect((await t.prisma.payment.findFirstOrThrow({ where: { orderId: o.id } })).status).toBe(
      'FAILED',
    );
    expect(await onHandOf(variantId)).toBe(30n); // physical stock untouched
  });

  it('parallel cancels (different keys) release exactly once', async () => {
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId, quantity: 3 }])).body.data;
    const o = (await place(t, c, { quoteId: q.quoteId, version: q.version })).body.data;
    const before = await reservedOf(variantId);
    const rs = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(t.server)
          .post(`/v1/me/orders/${o.id}/cancel`)
          .set('Authorization', c.auth)
          .set('Idempotency-Key', idemKey()),
      ),
    );
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await reservedOf(variantId)).toBe(before - 3n);
    expect(await t.prisma.stockMovement.count({ where: { refId: o.id, type: 'RELEASE' } })).toBe(1);
  });

  it('after confirmation the customer can only REQUEST cancellation; stock stays held until an admin approves', async () => {
    const owner = await ownerSession(t);
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId, quantity: 2 }])).body.data;
    const o = (await place(t, c, { quoteId: q.quoteId, version: q.version })).body.data;
    const before = await reservedOf(variantId);

    const confirm = await request(t.server)
      .post(`/v1/admin/orders/${o.id}/confirm`)
      .set('Authorization', owner.auth)
      .set('Idempotency-Key', idemKey())
      .send({});
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.status).toBe('CONFIRMED');

    const req = await request(t.server)
      .post(`/v1/me/orders/${o.id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .expect(200);
    expect(req.body.data.status).toBe('CANCEL_REQUESTED');
    expect(await reservedOf(variantId)).toBe(before); // still held

    const approve = await request(t.server)
      .post(`/v1/admin/orders/${o.id}/cancel`)
      .set('Authorization', owner.auth)
      .set('Idempotency-Key', idemKey())
      .send({ reason: 'CUSTOMER_REQUEST' });
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('CANCELLED');
    expect(await reservedOf(variantId)).toBe(before - 2n);
    const events = await t.prisma.orderStatusEvent.findMany({
      where: { orderId: o.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.toStatus)).toEqual([
      'PENDING_CONFIRMATION',
      'CONFIRMED',
      'CANCEL_REQUESTED',
      'CANCELLED',
    ]);
  });
});

describe('admin order handling (transition service, RBAC, PII and margin visibility)', () => {
  let variantId: string;
  beforeAll(async () => {
    await unlock(t);
    variantId = (await newSku(t, { sku: 'ADM-1', priceVnd: 80_000n, costVnd: 50_000n, stock: 40n }))
      .variant.id;
  });

  it('double/concurrent confirm yields exactly one success; invalid transitions are 409', async () => {
    const owner = await ownerSession(t);
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId, quantity: 1 }])).body.data;
    const o = (await place(t, c, { quoteId: q.quoteId, version: q.version })).body.data;
    const rs = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(t.server)
          .post(`/v1/admin/orders/${o.id}/confirm`)
          .set('Authorization', owner.auth)
          .set('Idempotency-Key', idemKey())
          .send({}),
      ),
    );
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(4);
    expect(
      await t.prisma.orderStatusEvent.count({ where: { orderId: o.id, toStatus: 'CONFIRMED' } }),
    ).toBe(1);

    // CONFIRMED → ON_HOLD → resume goes back to pending confirmation; resume from CONFIRMED is invalid
    const bad = await request(t.server)
      .post(`/v1/admin/orders/${o.id}/resume`)
      .set('Authorization', owner.auth)
      .set('Idempotency-Key', idemKey())
      .send({});
    expect(bad.status).toBe(409);
    expect(bad.body.code).toBe('INVALID_STATE_TRANSITION');
    const hold = await request(t.server)
      .post(`/v1/admin/orders/${o.id}/hold`)
      .set('Authorization', owner.auth)
      .set('Idempotency-Key', idemKey())
      .send({ reason: 'ADDRESS_CHECK' });
    expect(hold.body.data.status).toBe('ON_HOLD');
  });

  it('SALES_CS sees buyer contact but NOT margin; masked without pii:read; owner sees margin; customers/factory are denied', async () => {
    const owner = await ownerSession(t);
    await t.createUser({
      identity: 'sales-orders@example.test',
      password: PW,
      roles: ['SALES_CS'],
    });
    const sales = await t.login('sales-orders@example.test', PW, 'ADMIN');
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId, quantity: 2 }])).body.data;
    const o = (await place(t, c, { quoteId: q.quoteId, version: q.version })).body.data;

    const s = await request(t.server)
      .get(`/v1/admin/orders/${o.id}`)
      .set('Authorization', sales.auth)
      .expect(200);
    expect(s.body.data.contact.phone).toBe(ADDRESS.phone);
    expect(s.body.data.financial).toBeUndefined();
    expect(JSON.stringify(s.body).toLowerCase()).not.toMatch(/cost|margin/);

    const ow = await request(t.server)
      .get(`/v1/admin/orders/${o.id}`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(ow.body.data.financial).toEqual({
      revenueNetVnd: 160_000,
      costSnapshotVnd: 100_000,
      expectedMarginVnd: 60_000,
    });

    // a role without pii:read gets masked contact (ACCOUNTANT has pii:read; WAREHOUSE has no order access at all)
    await t.createUser({ identity: 'wh-orders@example.test', password: PW, roles: ['WAREHOUSE'] });
    const wh = await t.login('wh-orders@example.test', PW, 'ADMIN');
    expect(
      (await request(t.server).get(`/v1/admin/orders/${o.id}`).set('Authorization', wh.auth))
        .status,
    ).toBe(403);

    await t.createUser({
      identity: 'fm-orders@example.test',
      password: PW,
      roles: ['FACTORY_MANAGER'],
    });
    const fm = await t.login('fm-orders@example.test', PW, 'FACTORY');
    expect(
      (await request(t.server).get(`/v1/admin/orders/${o.id}`).set('Authorization', fm.auth))
        .status,
    ).toBe(401);
    expect(
      (await request(t.server).get('/v1/admin/orders').set('Authorization', c.auth)).status,
    ).toBe(401);

    const list = await request(t.server)
      .get('/v1/admin/orders?status=PENDING_CONFIRMATION&limit=5')
      .set('Authorization', sales.auth)
      .expect(200);
    expect(list.body.meta.limit).toBe(5);
    expect(list.body.data.length).toBeGreaterThan(0);
  });
});

describe('SKU activation gate and owner pricing/inventory APIs', () => {
  it('a REAL product (AI images only, origin unverified) cannot be published, even with price, cost and stock', async () => {
    const owner = await ownerSession(t);
    const product = await t.prisma.product.findFirstOrThrow({ where: { sourceName: 'Bột tẻ' } });
    const create = await request(t.server)
      .post('/v1/admin/variants')
      .set('Authorization', owner.auth)
      .send({
        productId: product.id,
        sku: 'BOT-TE-1KG',
        packLabel: 'Túi 1 kg',
        sellableUnit: 'tui',
        netWeightG: 1000,
        storageClass: 'DRY',
        manufacturer: 'Xưởng',
        responsibleEntity: 'Xưởng',
      });
    expect(create.status).toBe(201);
    expect(create.body.data.status).toBe('DRAFT');
    const vid = create.body.data.id as string;
    const wh = await request(t.server)
      .post('/v1/admin/warehouses')
      .set('Authorization', owner.auth)
      .send({ code: 'REAL-WH', name: 'Kho thật' })
      .expect(201);
    await request(t.server)
      .post('/v1/admin/prices')
      .set('Authorization', owner.auth)
      .send({ variantId: vid, unitPriceVnd: 20_000 })
      .expect(201);
    await request(t.server)
      .post('/v1/admin/costs')
      .set('Authorization', owner.auth)
      .send({ variantId: vid, costVnd: 10_000 })
      .expect(201);
    await request(t.server)
      .post('/v1/admin/inventory/adjustments')
      .set('Authorization', owner.auth)
      .set('Idempotency-Key', idemKey())
      .send({ warehouseId: wh.body.data.id, variantId: vid, delta: 5, reasonCode: 'OPENING_STOCK' })
      .expect(200);

    const readiness = await request(t.server)
      .get(`/v1/admin/variants/${vid}/readiness`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(readiness.body.data.ready).toBe(false);
    expect(
      readiness.body.data.items
        .filter((i: { ok: boolean }) => !i.ok)
        .map((i: { item: string }) => i.item)
        .sort(),
    ).toEqual(['ORIGIN_VERIFIED', 'VERIFIED_MEDIA']);

    const publish = await request(t.server)
      .post(`/v1/admin/variants/${vid}/publish`)
      .set('Authorization', owner.auth);
    expect(publish.status).toBe(422);
    expect(publish.body.code).toBe('SKU_NOT_READY');
    expect(publish.body.details.map((d: { item: string }) => d.item).sort()).toEqual([
      'ORIGIN_VERIFIED',
      'VERIFIED_MEDIA',
    ]);
    expect((await t.prisma.productVariant.findUniqueOrThrow({ where: { id: vid } })).status).toBe(
      'DRAFT',
    );
    // still only browsable: not sellable and no variant is exposed
    const pdp = await request(t.server).get('/v1/products/bot-te').expect(200);
    expect(pdp.body.data.sellable).toBe(false);
    expect(pdp.body.data.variants).toEqual([]);
  });

  it('a TEST SKU passes the gate; the product then appears publicly with price and in-stock flag but never cost', async () => {
    const owner = await ownerSession(t);
    const product = await t.prisma.product.findFirstOrThrow({
      where: { sourceName: 'Bột năng Tài Ký' },
    });
    const { variant } = await newSku(t, {
      productSourceName: 'Bột năng Tài Ký',
      sku: 'PUB-1',
      active: false,
      priceVnd: 33_000n,
      costVnd: 20_000n,
      stock: 7n,
    });
    expect(product.status).toBe('DRAFT');
    const pub = await request(t.server)
      .post(`/v1/admin/variants/${variant.id}/publish`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(pub.body.data.status).toBe('ACTIVE');
    const detail = await request(t.server).get(`/v1/products/${product.slug}`).expect(200);
    expect(detail.body.data.variants).toEqual([
      expect.objectContaining({ sku: 'TEST-PUB-1', unitPriceVnd: 33_000, inStock: true }),
    ]);
    const keys = [...allKeys(detail.body)].map((k) => k.toLowerCase());
    expect(
      keys.some((k) => k.includes('cost') || k.includes('margin') || k.includes('supplier')),
    ).toBe(false);
  });

  it('price windows cannot overlap; permissions and step-up MFA are enforced', async () => {
    const owner = await ownerSession(t);
    const { variant } = await newSku(t, { sku: 'OVL-1', priceVnd: 10_000n });
    const overlap = await request(t.server)
      .post('/v1/admin/prices')
      .set('Authorization', owner.auth)
      .send({ variantId: variant.id, unitPriceVnd: 11_000 });
    expect(overlap.status).toBe(400);
    expect(overlap.body.message).toMatch(/chồng/);
    await t.createUser({ identity: 'sales-price@example.test', password: PW, roles: ['SALES_CS'] });
    const sales = await t.login('sales-price@example.test', PW, 'ADMIN');
    expect(
      (
        await request(t.server)
          .post('/v1/admin/prices')
          .set('Authorization', sales.auth)
          .send({ variantId: variant.id, unitPriceVnd: 5 })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(t.server)
          .post('/v1/admin/costs')
          .set('Authorization', sales.auth)
          .send({ variantId: variant.id, costVnd: 5 })
      ).status,
    ).toBe(403);

    // step-up: a stale MFA (> 5 min) is refused for price writes until it is verified again
    t.clock.advance(6 * 60 * 1000);
    const stale = await request(t.server)
      .post('/v1/admin/prices')
      .set('Authorization', owner.auth)
      .send({ variantId: variant.id, unitPriceVnd: 12_000, minQty: 5 });
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe('STEP_UP_REQUIRED');
    const fresh = await ownerSession(t);
    expect(
      (
        await request(t.server)
          .post('/v1/admin/prices')
          .set('Authorization', fresh.auth)
          .send({ variantId: variant.id, unitPriceVnd: 12_000, minQty: 5 })
      ).status,
    ).toBe(201);
  });

  it('inventory adjustments: ledger entry, idempotent, never below reserved', async () => {
    const owner = await ownerSession(t);
    await unlock(t);
    const { variant, warehouse } = await newSku(t, { sku: 'ADJ-1', stock: 10n });
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId: variant.id, quantity: 6 }])).body.data;
    await place(t, c, { quoteId: q.quoteId, version: q.version });

    const key = idemKey('adj');
    const body = {
      warehouseId: warehouse.id,
      variantId: variant.id,
      delta: -3,
      reasonCode: 'COUNT_DAMAGE',
    };
    const r1 = await request(t.server)
      .post('/v1/admin/inventory/adjustments')
      .set('Authorization', owner.auth)
      .set('Idempotency-Key', key)
      .send(body);
    expect(r1.status).toBe(200);
    expect(r1.body.data).toEqual({ onHand: 7, reserved: 6, available: 1 });
    const r2 = await request(t.server)
      .post('/v1/admin/inventory/adjustments')
      .set('Authorization', owner.auth)
      .set('Idempotency-Key', key)
      .send(body);
    expect(r2.body.data).toEqual({ onHand: 7, reserved: 6, available: 1 }); // replay: applied once
    expect(
      await t.prisma.stockMovement.count({
        where: { variantId: variant.id, type: 'ADJUST_MINUS' },
      }),
    ).toBe(1);
    const tooMuch = await request(t.server)
      .post('/v1/admin/inventory/adjustments')
      .set('Authorization', owner.auth)
      .set('Idempotency-Key', idemKey())
      .send({ ...body, delta: -2 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await onHandOf(variant.id)).toBe(7n);
  });
});

describe('ledgers and terminal states are append-only at the database level', () => {
  it('stock_movements and order_status_events cannot be edited; a released reservation cannot be re-held', async () => {
    await unlock(t);
    const { variant } = await newSku(t, { sku: 'LED-1', stock: 5n });
    const c = await newCustomer(t);
    const q = (await quote(t, c, [{ variantId: variant.id, quantity: 1 }])).body.data;
    const o = (await place(t, c, { quoteId: q.quoteId, version: q.version })).body.data;
    await expect(
      t.prisma.stockMovement.updateMany({ where: { variantId: variant.id }, data: { qty: 99n } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      t.prisma.orderStatusEvent.deleteMany({ where: { orderId: o.id } }),
    ).rejects.toThrow(/append-only/);
    await request(t.server)
      .post(`/v1/me/orders/${o.id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .expect(200);
    await expect(
      t.prisma.inventoryReservation.updateMany({
        where: { orderId: o.id },
        data: { status: 'HELD' },
      }),
    ).rejects.toThrow(/terminal/);
  });
});
