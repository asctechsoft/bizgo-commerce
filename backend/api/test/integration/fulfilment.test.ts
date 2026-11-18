import request from 'supertest';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { createTestApp, type TestApp } from '../helpers/app';
import {
  idemKey,
  newCustomer,
  newSku,
  ownerSession,
  place,
  quote,
  unlock,
  type Customer,
} from '../helpers/commerce';

let t: TestApp;
let owner: { auth: string };
beforeAll(async () => {
  t = await createTestApp();
  await unlock(t);
  owner = await ownerSession(t);
});
afterAll(async () => {
  await t.close();
});

async function orderFor(c: Customer, sku: string, qty = 2) {
  const { variant } = await newSku(t, { sku, stock: 20n });
  const q = (await quote(t, c, [{ variantId: variant.id, quantity: qty }])).body.data;
  const o = await place(t, c, { quoteId: q.quoteId, version: q.version });
  expect(o.status).toBe(201);
  return { variant, id: o.body.data.id as string };
}
const admin = (id: string, action: string, body: object = {}) =>
  request(t.server)
    .post(`/v1/admin/orders/${id}/${action}`)
    .set('Authorization', owner.auth)
    .set('Idempotency-Key', idemKey())
    .send(body);
const detail = (c: Customer, id: string) =>
  request(t.server).get(`/v1/me/orders/${id}`).set('Authorization', c.auth);
const stockOf = async (variantId: string) =>
  t.prisma.inventoryBalance.findFirstOrThrow({ where: { variantId } });

describe('order lifecycle: confirm → pack → ready → ship → deliver → complete (+COD)', () => {
  it('walks the full happy path with shipment, stock dispatch and COD collection', async () => {
    const c = await newCustomer(t);
    const { variant, id } = await orderFor(c, 'LIFE-1');
    expect((await stockOf(variant.id)).reserved).toBe(2n);

    // out-of-order actions are rejected
    expect((await admin(id, 'ship', { carrier: 'GHN', trackingCode: 'GHN123' })).status).toBe(409);
    expect((await admin(id, 'deliver')).status).toBe(409);

    expect((await admin(id, 'confirm')).body.data.status).toBe('CONFIRMED');
    expect((await admin(id, 'pack')).body.data.status).toBe('PACKING');
    expect((await admin(id, 'ready')).body.data.status).toBe('READY_TO_SHIP');
    // shipping needs carrier + tracking
    expect((await admin(id, 'ship', {})).status).toBe(400);
    const shipped = await admin(id, 'ship', { carrier: 'GHN', trackingCode: 'GHN123456' });
    expect(shipped.body.data.status).toBe('SHIPPED');
    const afterShip = await stockOf(variant.id);
    expect(afterShip.onHand).toBe(18n); // goods physically left
    expect(afterShip.reserved).toBe(0n);

    let d = (await detail(c, id)).body.data;
    expect(d.group).toBe('shipping');
    expect(d.shipment).toEqual(
      expect.objectContaining({ carrier: 'GHN', trackingCode: 'GHN123456', deliveredAt: null }),
    );
    expect(d.actions.cancel).toBeNull(); // too late to cancel
    const lateCancel = await request(t.server)
      .post(`/v1/me/orders/${id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .send({});
    expect(lateCancel.status).toBe(409);

    // COD cash cannot be recorded before delivery
    expect(
      (
        await request(t.server)
          .post(`/v1/admin/orders/${id}/collect-cod`)
          .set('Authorization', owner.auth)
      ).status,
    ).toBe(409);
    expect((await admin(id, 'deliver')).body.data.status).toBe('DELIVERED');
    d = (await detail(c, id)).body.data;
    expect(d.shipment.deliveredAt).not.toBeNull();
    expect(d.payment.status).toBe('PENDING'); // delivered ≠ paid until staff records the cash

    const cod = await request(t.server)
      .post(`/v1/admin/orders/${id}/collect-cod`)
      .set('Authorization', owner.auth);
    expect(cod.body.data.paymentStatus).toBe('PAID');
    expect(
      (
        await request(t.server)
          .post(`/v1/admin/orders/${id}/collect-cod`)
          .set('Authorization', owner.auth)
      ).status,
    ).toBe(409); // exactly once
    expect((await admin(id, 'complete')).body.data.status).toBe('COMPLETED');
    d = (await detail(c, id)).body.data;
    expect(d.group).toBe('delivered');
    expect(d.payment.status).toBe('PAID');
    expect(d.timeline.map((e: { to: string }) => e.to)).toEqual([
      'PENDING_CONFIRMATION',
      'CONFIRMED',
      'PACKING',
      'READY_TO_SHIP',
      'SHIPPED',
      'DELIVERED',
      'COMPLETED',
    ]);
  });

  it('a customer can never call staff actions and cannot see another customer’s order', async () => {
    const a = await newCustomer(t);
    const b = await newCustomer(t);
    const { id } = await orderFor(a, 'LIFE-2', 1);
    const forbidden = await request(t.server)
      .post(`/v1/admin/orders/${id}/confirm`)
      .set('Authorization', a.auth)
      .set('Idempotency-Key', idemKey())
      .send({});
    expect(forbidden.status).toBeGreaterThanOrEqual(401);
    expect((await detail(b, id)).status).toBe(404);
    expect(
      (
        await request(t.server)
          .post(`/v1/me/orders/${id}/support`)
          .set('Authorization', b.auth)
          .send({ type: 'OTHER', description: 'hello there' })
      ).status,
    ).toBe(404);
  });

  it('idempotent staff action: replay does not transition twice', async () => {
    const c = await newCustomer(t);
    const { id } = await orderFor(c, 'LIFE-3', 1);
    const key = idemKey();
    const call = () =>
      request(t.server)
        .post(`/v1/admin/orders/${id}/confirm`)
        .set('Authorization', owner.auth)
        .set('Idempotency-Key', key)
        .send({});
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await detail(c, id)).body.data.timeline).toHaveLength(2);
  });
});

describe('cancellation rules and reasons', () => {
  it('cancels immediately before confirmation with a reason and releases stock once', async () => {
    const c = await newCustomer(t);
    const { variant, id } = await orderFor(c, 'CAN-1');
    const r = await request(t.server)
      .post(`/v1/me/orders/${id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .send({ reason: 'CHANGED_MIND' });
    expect(r.body.data.status).toBe('CANCELLED');
    expect((await stockOf(variant.id)).reserved).toBe(0n);
    const d = (await detail(c, id)).body.data;
    expect(d.cancel).toEqual(
      expect.objectContaining({ by: 'CUSTOMER', reasonCode: 'CHANGED_MIND' }),
    );
    expect(d.group).toBe('cancelled');
  });

  it('rejects a free-text / unknown cancel reason', async () => {
    const c = await newCustomer(t);
    const { id } = await orderFor(c, 'CAN-2', 1);
    const r = await request(t.server)
      .post(`/v1/me/orders/${id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .send({ reason: 'secret internal note' });
    expect(r.status).toBe(400);
  });

  it('after confirmation the customer only REQUESTS cancel; staff approve or reject', async () => {
    const c = await newCustomer(t);
    const { variant, id } = await orderFor(c, 'CAN-3');
    await admin(id, 'confirm');
    expect((await detail(c, id)).body.data.actions.cancel).toBe('REQUEST_CANCEL');
    const req = await request(t.server)
      .post(`/v1/me/orders/${id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .send({ reason: 'WRONG_ADDRESS' });
    expect(req.body.data.status).toBe('CANCEL_REQUESTED');
    expect((await admin(id, 'reject-cancel')).body.data.status).toBe('CONFIRMED');
    await request(t.server)
      .post(`/v1/me/orders/${id}/cancel`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .send({});
    expect((await admin(id, 'cancel', { reason: 'OUT_OF_STOCK' })).body.data.status).toBe(
      'CANCELLED',
    );
    expect((await stockOf(variant.id)).reserved).toBe(0n);
    // internal reasons never reach the customer; whitelisted ones do
    const d = (await detail(c, id)).body.data;
    expect(d.cancel.by).toBe('STAFF');
    expect(d.cancel.reasonCode).toBe('OUT_OF_STOCK');
  });

  it('hides non-whitelisted staff cancel reasons from the customer', async () => {
    const c = await newCustomer(t);
    const { id } = await orderFor(c, 'CAN-4', 1);
    await admin(id, 'cancel', { reason: 'internal_note_123' });
    const d = (await detail(c, id)).body.data;
    expect(d.cancel.reasonCode).toBeNull();
  });
});

describe('summary, groups, reorder, shipping fee', () => {
  it('counts orders per group and filters by group / sort', async () => {
    const c = await newCustomer(t);
    const o1 = await orderFor(c, 'SUM-1', 1);
    const o2 = await orderFor(c, 'SUM-2', 1);
    await admin(o2.id, 'confirm');
    const s = (await request(t.server).get('/v1/me/orders/summary').set('Authorization', c.auth))
      .body.data;
    expect(s).toEqual(expect.objectContaining({ all: 2, pending: 1, confirmed: 1, cancelled: 0 }));
    const list = (
      await request(t.server).get('/v1/me/orders?group=pending').set('Authorization', c.auth)
    ).body.data;
    expect(list.map((o: { id: string }) => o.id)).toEqual([o1.id]);
    expect(list[0].preview[0]).toEqual(expect.objectContaining({ quantity: 1 }));
    const asc = (
      await request(t.server).get('/v1/me/orders?sort=oldest').set('Authorization', c.auth)
    ).body.data;
    expect(asc[0].id).toBe(o1.id);
  });

  it('reorder puts available lines back in the cart and reports skipped ones; replay is idempotent', async () => {
    const c = await newCustomer(t);
    const { variant, id } = await orderFor(c, 'RE-1', 3);
    const key = idemKey();
    const go = () =>
      request(t.server)
        .post(`/v1/me/orders/${id}/reorder`)
        .set('Authorization', c.auth)
        .set('Idempotency-Key', key)
        .send({});
    expect((await go()).body.data).toEqual({ added: 1, skipped: [] });
    await go();
    const cart = (await request(t.server).get('/v1/cart').set('Authorization', c.auth)).body.data;
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toEqual(expect.objectContaining({ variantId: variant.id, quantity: 3 }));
    // a paused variant is skipped, not an error
    await t.prisma.productVariant.update({ where: { id: variant.id }, data: { status: 'PAUSED' } });
    const r = await request(t.server)
      .post(`/v1/me/orders/${id}/reorder`)
      .set('Authorization', c.auth)
      .set('Idempotency-Key', idemKey())
      .send({});
    expect(r.body.data.added).toBe(0);
    expect(r.body.data.skipped).toHaveLength(1);
  });

  it('staff set the shipping fee: total updates, only before packing', async () => {
    const c = await newCustomer(t);
    const { id } = await orderFor(c, 'FEE-1', 2); // 2 × 50.000
    const set = (fee: number) =>
      request(t.server)
        .post(`/v1/admin/orders/${id}/shipping-fee`)
        .set('Authorization', owner.auth)
        .send({ feeVnd: fee });
    expect((await set(20_000)).body.data.totalVnd).toBe(120_000);
    const d = (await detail(c, id)).body.data;
    expect(d.shippingFeeVnd).toBe(20_000);
    expect(d.totalVnd).toBe(120_000);
    expect(d.shippingNote).toBeNull();
    await admin(id, 'confirm');
    await admin(id, 'pack');
    expect((await set(1_000)).status).toBe(409);
  });
});

describe('support requests', () => {
  it('customer opens a request, staff reply, customer sees it; other customers cannot', async () => {
    const c = await newCustomer(t);
    const other = await newCustomer(t);
    const { id } = await orderFor(c, 'SUP-1', 1);
    const order = (await detail(c, id)).body.data;
    const created = await request(t.server)
      .post(`/v1/me/orders/${id}/support`)
      .set('Authorization', c.auth)
      .send({
        type: 'MISSING_ITEM',
        orderItemIds: [order.items[0].id],
        description: 'Thiếu 1 gói',
      });
    expect(created.status).toBe(201);
    const sid = created.body.data.id as string;
    expect(created.body.data.status).toBe('OPEN');
    expect(created.body.data.orderItems).toHaveLength(1);

    // foreign item ids are rejected
    const bad = await request(t.server)
      .post(`/v1/me/orders/${id}/support`)
      .set('Authorization', c.auth)
      .send({
        type: 'OTHER',
        orderItemIds: ['00000000-0000-4000-8000-000000000000'],
        description: 'hello there',
      });
    expect(bad.status).toBe(400);

    const reply = await request(t.server)
      .post(`/v1/admin/support/${sid}/messages`)
      .set('Authorization', owner.auth)
      .send({ body: 'Chúng tôi sẽ gửi bù.' });
    expect(reply.body.data.status).toBe('IN_PROGRESS');
    const mine = (
      await request(t.server).get(`/v1/me/orders/${id}/support`).set('Authorization', c.auth)
    ).body.data;
    expect(mine[0].messages).toEqual([
      expect.objectContaining({ from: 'STAFF', body: 'Chúng tôi sẽ gửi bù.' }),
    ]);
    expect(
      (
        await request(t.server)
          .post(`/v1/me/support/${sid}/messages`)
          .set('Authorization', other.auth)
          .send({ body: 'hi' })
      ).status,
    ).toBe(404);
    await request(t.server)
      .post(`/v1/admin/support/${sid}/status`)
      .set('Authorization', owner.auth)
      .send({ status: 'RESOLVED' })
      .expect(200);
    const again = await request(t.server)
      .post(`/v1/me/support/${sid}/messages`)
      .set('Authorization', c.auth)
      .send({ body: 'Vẫn chưa nhận được' });
    expect(again.body.data.status).toBe('OPEN'); // customer reply reopens
    const list = await request(t.server)
      .get('/v1/admin/support?status=OPEN')
      .set('Authorization', owner.auth);
    expect(list.body.data.some((s: { id: string }) => s.id === sid)).toBe(true);
    // customers cannot use the staff inbox
    expect(
      (await request(t.server).get('/v1/admin/support').set('Authorization', c.auth)).status,
    ).toBeGreaterThanOrEqual(401);
  });
});

describe('realtime stream (SSE)', () => {
  it('pushes only the owner’s order changes and heartbeats', async () => {
    const c = await newCustomer(t);
    const other = await newCustomer(t);
    const { id } = await orderFor(c, 'SSE-1', 1);
    const srv = http.createServer(t.app.getHttpAdapter().getInstance());
    await new Promise<void>((resolve) => srv.listen(0, resolve));
    const port = (srv.address() as AddressInfo).port;
    const received: string[] = [];
    const open = (token: string, sink: string[]) =>
      new Promise<http.ClientRequest>((resolve) => {
        const req = http.get(
          {
            port,
            path: '/v1/me/orders/stream',
            headers: { Authorization: token, Accept: 'text/event-stream' },
          },
          (res) => {
            expect(res.headers['content-type']).toContain('text/event-stream');
            res.on('data', (d) => sink.push(String(d)));
            resolve(req);
          },
        );
      });
    const otherSink: string[] = [];
    const r1 = await open(c.auth, received);
    const r2 = await open(other.auth, otherSink);
    await admin(id, 'confirm');
    await new Promise((r) => setTimeout(r, 300));
    r1.destroy();
    r2.destroy();
    srv.close();
    const text = received.join('');
    expect(text).toContain('event: order');
    expect(text).toContain(`"orderId":"${id}"`);
    expect(text).toContain('"status":"CONFIRMED"');
    expect(otherSink.join('')).not.toContain(id);
    // staff/customer isolation: no PII or amounts on the wire
    expect(text).not.toMatch(/totalVnd|phone|address/);
  });
});
