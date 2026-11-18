import { randomBytes } from 'node:crypto';
import request, { type Test } from 'supertest';
import { createTestSku, unlockCheckoutForTests, type TestSkuInput } from '@bizgo/db';
import { SessionService } from '../../src/auth/session.service';
import type { TestApp } from './app';

export const PW = 'Customer-Pass-123456';
export const ADDRESS = {
  receiverName: 'Nguyễn Văn A',
  phone: '0912345678',
  province: 'Hà Nội',
  district: 'Cầu Giấy',
  ward: 'Dịch Vọng',
  detail: 'Số 1 ngõ 2',
};

export const idemKey = (p = 'idem') => `${p}-${randomBytes(10).toString('hex')}`;

export interface Customer {
  userId: string;
  auth: string;
  addressId: string;
  identity: string;
}

let seq = 0;

export async function newCustomer(t: TestApp, province = ADDRESS.province): Promise<Customer> {
  const identity = `cust${++seq}-${randomBytes(3).toString('hex')}@example.test`;
  const userId = await t.createUser({ identity, password: PW, roles: ['CUSTOMER'] });
  const login = await t.login(identity, PW);
  const addr = await request(t.server)
    .post('/v1/me/addresses')
    .set('Authorization', login.auth)
    .send({ ...ADDRESS, province })
    .expect(201);
  return { userId, auth: login.auth, addressId: addr.body.data.id as string, identity };
}

export async function newSku(t: TestApp, input: Partial<TestSkuInput> & { sku: string }) {
  return createTestSku(t.prisma, {
    productSourceName: 'Bột nếp',
    priceVnd: 50_000n,
    costVnd: 30_000n,
    stock: 10n,
    ...input,
  });
}

export async function unlock(t: TestApp, opts?: Parameters<typeof unlockCheckoutForTests>[1]) {
  await unlockCheckoutForTests(t.prisma, opts);
}

export function quote(
  t: TestApp,
  c: Customer,
  items: { variantId: string; quantity: number }[],
  addressId = c.addressId,
): Test {
  return request(t.server)
    .post('/v1/checkout/quote')
    .set('Authorization', c.auth)
    .send({ items, addressId });
}

export function place(
  t: TestApp,
  c: Customer,
  q: { quoteId: string; version: number },
  key = idemKey(),
  paymentMethod: 'COD' | 'BANK_TRANSFER' = 'COD',
): Test {
  return request(t.server)
    .post('/v1/orders')
    .set('Authorization', c.auth)
    .set('Idempotency-Key', key)
    .send({ checkoutQuoteId: q.quoteId, acceptedQuoteVersion: q.version, paymentMethod });
}

/**
 * A fresh ADMIN session for the fixture OWNER with MFA marked verified NOW. (Login + TOTP ceremony is
 * covered in rbac-mfa.test.ts; here we need many short-lived sessions across a moving test clock.)
 */
export async function ownerSession(t: TestApp) {
  const ident = 'owner-fixture@example.test';
  const existing = await t.prisma.identity.findUnique({
    where: { type_valueNorm: { type: 'EMAIL', valueNorm: ident } },
  });
  const userId =
    existing?.userId ?? (await t.createUser({ identity: ident, password: PW, roles: ['OWNER'] }));
  const tokens = await t.app
    .get(SessionService)
    .create(userId, 'ADMIN', { ipHash: null, uaHash: null }, { mfaVerifiedAt: t.clock.now() });
  return { auth: `Bearer ${tokens.accessToken}`, userId };
}

/** Recursively collect every key name in a JSON value. */
export function allKeys(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, acc));
  else if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      acc.add(k);
      allKeys(val, acc);
    }
  }
  return acc;
}
