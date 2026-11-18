import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const PASSWORD = 'Correct-Horse-Battery-9';

function register(identity: string, extra: Record<string, unknown> = {}) {
  return request(t.server)
    .post('/v1/auth/register')
    .send({ identity, password: PASSWORD, displayName: 'Khách Thử', acceptTerms: true, ...extra });
}

describe('registration + OTP (UAT-15, P1-07)', () => {
  it('registers, requires OTP verification, then allows login; code is never in any response', async () => {
    const res = await register('khach1@example.test').expect(201);
    expect(res.body.data.requiresVerification).toBe(true);

    // cannot log in before verification
    const early = await t.login('khach1@example.test', PASSWORD);
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('ACCOUNT_NOT_VERIFIED');

    const code = t.transport.lastFor('khach1@example.test')?.code as string;
    expect(code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(res.body)).not.toContain(code); // the code is only ever delivered out-of-band
    await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({ identity: 'khach1@example.test', purpose: 'REGISTER_VERIFY', code })
      .expect(200);

    const login = await t.login('khach1@example.test', PASSWORD);
    expect(login.status).toBe(200);
    expect(login.body.data.user.roles).toEqual(['CUSTOMER']);
    expect(login.body.data.mfa.required).toBe(false);

    const me = await request(t.server).get('/v1/me').set('Authorization', login.auth).expect(200);
    expect(me.body.data.identities[0]).toEqual({
      type: 'EMAIL',
      value: 'khach1@example.test',
      verified: true,
    });
  });

  it('requires acceptance of terms and a policy-compliant password', async () => {
    await register('k2@example.test', { acceptTerms: false }).expect(400);
    await register('k2@example.test', { password: 'short' }).expect(400);
    await register('k2@example.test', { password: 'password123' }).expect(400);
    await register('not-an-email').expect(400);
  });

  it('rejects a taken verified identity but lets the real owner take over an unverified one', async () => {
    await register('k3@example.test').expect(201);
    const first = t.transport.lastFor('k3@example.test')?.code as string;
    // squatter registered; real owner registers again (after cooldown) with a new password
    t.clock.advance(61_000);
    await register('k3@example.test', { password: 'Another-Strong-Pass-1' }).expect(201);
    const second = t.transport.lastFor('k3@example.test')?.code as string;
    // the first code was invalidated by the second
    await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({
        identity: 'k3@example.test',
        purpose: 'REGISTER_VERIFY',
        code: first === second ? '000000' : first,
      })
      .expect((r) => expect([400, 429]).toContain(r.status));
    await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({ identity: 'k3@example.test', purpose: 'REGISTER_VERIFY', code: second })
      .expect(200);
    await register('k3@example.test').expect(409);
  });

  it('normalises phone numbers (0912…, +84912…) to one identity', async () => {
    await register('0912345001').expect(201);
    t.clock.advance(61_000); // OTP resend cooldown
    await register('+84912345001').expect(201); // same identity (unverified takeover path)
    const count = await t.prisma.identity.count({ where: { valueNorm: '0912345001' } });
    expect(count).toBe(1);
  });

  it('OTP: wrong code never reveals the right one, locks after 5 attempts, TTL expires', async () => {
    await register('k4@example.test').expect(201);
    const code = t.transport.lastFor('k4@example.test')?.code as string;
    const wrong = code === '111111' ? '222222' : '111111';
    for (let i = 0; i < 4; i++) {
      const r = await request(t.server)
        .post('/v1/auth/otp/verify')
        .send({ identity: 'k4@example.test', purpose: 'REGISTER_VERIFY', code: wrong });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('OTP_INVALID');
    }
    const fifth = await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({ identity: 'k4@example.test', purpose: 'REGISTER_VERIFY', code: wrong });
    expect(fifth.body.code).toBe('OTP_LOCKED');
    // even the correct code is refused once locked
    const afterLock = await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({ identity: 'k4@example.test', purpose: 'REGISTER_VERIFY', code });
    expect(afterLock.body.code).toBe('OTP_LOCKED');
  });

  it('OTP expires after 5 minutes', async () => {
    await register('k5@example.test').expect(201);
    const code = t.transport.lastFor('k5@example.test')?.code as string;
    t.clock.advance(5 * 60 * 1000 + 1000);
    const r = await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({ identity: 'k5@example.test', purpose: 'REGISTER_VERIFY', code });
    expect(r.body.code).toBe('OTP_EXPIRED');
  });

  it('resend honours a 60 s cooldown, then issues a fresh code and invalidates the old', async () => {
    await register('k6@example.test').expect(201);
    const old = t.transport.lastFor('k6@example.test')?.code as string;
    const tooSoon = await request(t.server)
      .post('/v1/auth/otp/resend')
      .send({ identity: 'k6@example.test', purpose: 'REGISTER_VERIFY' });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.headers['retry-after']).toBeDefined();
    t.clock.advance(61_000);
    await request(t.server)
      .post('/v1/auth/otp/resend')
      .send({ identity: 'k6@example.test', purpose: 'REGISTER_VERIFY' })
      .expect(200);
    const fresh = t.transport.lastFor('k6@example.test')?.code as string;
    if (fresh !== old) {
      const r = await request(t.server)
        .post('/v1/auth/otp/verify')
        .send({ identity: 'k6@example.test', purpose: 'REGISTER_VERIFY', code: old });
      expect(r.status).toBe(400);
    }
    await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({ identity: 'k6@example.test', purpose: 'REGISTER_VERIFY', code: fresh })
      .expect(200);
  });

  it('a successfully used OTP cannot be replayed', async () => {
    await register('k7@example.test').expect(201);
    const code = t.transport.lastFor('k7@example.test')?.code as string;
    await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({ identity: 'k7@example.test', purpose: 'REGISTER_VERIFY', code })
      .expect(200);
    const again = await request(t.server)
      .post('/v1/auth/otp/verify')
      .send({ identity: 'k7@example.test', purpose: 'REGISTER_VERIFY', code });
    expect(again.status).toBe(400);
  });

  it('never accepts a fixed demo OTP such as 123456 (unless it is the real random code)', async () => {
    await register('k8@example.test').expect(201);
    const code = t.transport.lastFor('k8@example.test')?.code as string;
    if (code !== '123456') {
      const r = await request(t.server)
        .post('/v1/auth/otp/verify')
        .send({ identity: 'k8@example.test', purpose: 'REGISTER_VERIFY', code: '123456' });
      expect(r.status).toBe(400);
    }
  });

  it('otp/request is non-enumerating for unknown identities', async () => {
    const unknown = await request(t.server)
      .post('/v1/auth/otp/request')
      .send({ identity: 'ghost@example.test', purpose: 'REGISTER_VERIFY' })
      .expect(200);
    expect(unknown.body.data.sent).toBe(true);
    expect(t.transport.lastFor('ghost@example.test')).toBeUndefined();
  });
});

describe('fail-closed OTP delivery in production-like config (D15)', () => {
  it('returns 503 OTP_DELIVERY_NOT_CONFIGURED when no provider is configured and creates no account', async () => {
    const prodLike = await createTestApp({ DEV_OTP_CONSOLE: 'false' });
    try {
      const res = await request(prodLike.server).post('/v1/auth/register').send({
        identity: 'x@example.test',
        password: PASSWORD,
        displayName: 'X Y',
        acceptTerms: true,
      });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('OTP_DELIVERY_NOT_CONFIGURED');
      expect(await prodLike.prisma.user.count()).toBe(0);
      const forgot = await request(prodLike.server)
        .post('/v1/auth/password/forgot')
        .send({ identity: 'x@example.test' });
      expect(forgot.status).toBe(503);
    } finally {
      await prodLike.close();
    }
  });
});

describe('login, rate limiting, sessions', () => {
  beforeAll(async () => {
    await t.createUser({ identity: 'login@example.test', password: PASSWORD, roles: ['CUSTOMER'] });
  });

  it('uses identical errors for unknown user and wrong password', async () => {
    const a = await t.login('nobody@example.test', PASSWORD);
    const b = await t.login('login@example.test', 'Wrong-Password-123');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.code).toBe('CREDENTIALS_INVALID');
    expect(b.body).toEqual({ ...a.body, requestId: b.body.requestId });
  });

  it('rate-limits repeated failures per identity, then recovers after the window', async () => {
    await t.createUser({ identity: 'brute@example.test', password: PASSWORD, roles: ['CUSTOMER'] });
    for (let i = 0; i < 5; i++) {
      const r = await t.login('brute@example.test', 'Wrong-Password-123');
      expect(r.status).toBe(401);
    }
    const blocked = await t.login('brute@example.test', PASSWORD); // even the right password is refused
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    t.clock.advance(15 * 60 * 1000 + 1000);
    const ok = await t.login('brute@example.test', PASSWORD);
    expect(ok.status).toBe(200);
  });

  it('web login sets HttpOnly cookies and enforces CSRF on unsafe requests', async () => {
    const agent = request.agent(t.server);
    const res = await agent
      .post('/v1/auth/login')
      .send({ identity: 'login@example.test', password: PASSWORD })
      .expect(200);
    expect(res.body.data.accessToken).toBeUndefined(); // tokens are NOT in the body for web clients
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookies).toMatch(/bg_sid=[^;]+; Path=\/; Expires=[^;]+; HttpOnly/);
    expect(cookies).toMatch(/bg_rt=[^;]+; Path=\/v1\/auth;/);
    expect(cookies).toMatch(/SameSite=Lax/);
    await agent.get('/v1/me').expect(200);
    // unsafe request without CSRF header → refused, with header → accepted
    const noCsrf = await agent.patch('/v1/me').send({ displayName: 'Tên Mới' });
    expect(noCsrf.status).toBe(403);
    const withCsrf = await agent
      .patch('/v1/me')
      .set('X-CSRF-Token', res.body.data.csrfToken)
      .send({ displayName: 'Tên Mới' });
    expect(withCsrf.status).toBe(200);
    expect(withCsrf.body.data.displayName).toBe('Tên Mới');
    // a wrong token is refused
    await agent
      .patch('/v1/me')
      .set('X-CSRF-Token', 'forged')
      .send({ displayName: 'X Y' })
      .expect(403);
  });

  it('logout revokes the session immediately', async () => {
    const l = await t.login('login@example.test', PASSWORD);
    await request(t.server).get('/v1/me').set('Authorization', l.auth).expect(200);
    await request(t.server).post('/v1/auth/logout').set('Authorization', l.auth).expect(200);
    await request(t.server).get('/v1/me').set('Authorization', l.auth).expect(401);
    // the refresh token of a revoked family is dead too
    const r = await request(t.server)
      .post('/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: l.refreshToken });
    expect(r.status).toBe(401);
  });

  it('access tokens expire after 15 minutes; refresh rotates and the old refresh token is single-use', async () => {
    const l = await t.login('login@example.test', PASSWORD);
    t.clock.advance(16 * 60 * 1000);
    await request(t.server).get('/v1/me').set('Authorization', l.auth).expect(401);
    const r1 = await request(t.server)
      .post('/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: l.refreshToken })
      .expect(200);
    const newAuth = `Bearer ${r1.body.data.accessToken}`;
    await request(t.server).get('/v1/me').set('Authorization', newAuth).expect(200);

    // reuse of the already-rotated refresh token = theft signal → whole family revoked
    const reuse = await request(t.server)
      .post('/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: l.refreshToken });
    expect(reuse.status).toBe(401);
    await request(t.server).get('/v1/me').set('Authorization', newAuth).expect(401);
    const log = await t.prisma.auditLog.findFirst({
      where: { action: 'auth.refresh_reuse_detected' },
    });
    expect(log).not.toBeNull();
  });

  it('rejects garbage and wrong-realm bearer tokens', async () => {
    await request(t.server).get('/v1/me').set('Authorization', 'Bearer garbage').expect(401);
    await request(t.server)
      .get('/v1/me')
      .set('Authorization', 'Bearer bga.' + 'x'.repeat(40))
      .expect(401);
  });
});

describe('password change / forgot / reset', () => {
  it('change requires the current password, revokes other sessions and keeps the current one', async () => {
    await t.createUser({ identity: 'pw@example.test', password: PASSWORD, roles: ['CUSTOMER'] });
    const a = await t.login('pw@example.test', PASSWORD);
    const b = await t.login('pw@example.test', PASSWORD);
    const bad = await request(t.server)
      .post('/v1/auth/password/change')
      .set('Authorization', a.auth)
      .send({ currentPassword: 'nope-nope-nope', newPassword: 'Brand-New-Pass-77' });
    expect(bad.status).toBe(401);
    await request(t.server)
      .post('/v1/auth/password/change')
      .set('Authorization', a.auth)
      .send({ currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-77' })
      .expect(200);
    await request(t.server).get('/v1/me').set('Authorization', a.auth).expect(200);
    await request(t.server).get('/v1/me').set('Authorization', b.auth).expect(401);
    expect((await t.login('pw@example.test', PASSWORD)).status).toBe(401);
    expect((await t.login('pw@example.test', 'Brand-New-Pass-77')).status).toBe(200);
  });

  it('forgot is non-enumerating (always 202); reset token is single-use, expires, and kills all sessions', async () => {
    await t.createUser({ identity: 'reset@example.test', password: PASSWORD, roles: ['CUSTOMER'] });
    const live = await t.login('reset@example.test', PASSWORD);

    const known = await request(t.server)
      .post('/v1/auth/password/forgot')
      .send({ identity: 'reset@example.test' });
    const unknown = await request(t.server)
      .post('/v1/auth/password/forgot')
      .send({ identity: 'nobody-here@example.test' });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body.data).toEqual(known.body.data);
    expect(t.transport.lastFor('nobody-here@example.test', 'PASSWORD_RESET')).toBeUndefined();

    const token = t.transport.lastFor('reset@example.test', 'PASSWORD_RESET')?.resetToken as string;
    expect(token.length).toBeGreaterThan(30);
    await request(t.server)
      .post('/v1/auth/password/reset')
      .send({ token, newPassword: 'Totally-New-Pass-55' })
      .expect(200);
    await request(t.server).get('/v1/me').set('Authorization', live.auth).expect(401); // sessions revoked
    const reuse = await request(t.server)
      .post('/v1/auth/password/reset')
      .send({ token, newPassword: 'Another-New-Pass-66' });
    expect(reuse.status).toBe(400);
    expect((await t.login('reset@example.test', 'Totally-New-Pass-55')).status).toBe(200);
  });

  it('expired reset tokens are refused', async () => {
    await t.createUser({
      identity: 'reset2@example.test',
      password: PASSWORD,
      roles: ['CUSTOMER'],
    });
    await request(t.server)
      .post('/v1/auth/password/forgot')
      .send({ identity: 'reset2@example.test' })
      .expect(202);
    const token = t.transport.lastFor('reset2@example.test', 'PASSWORD_RESET')
      ?.resetToken as string;
    t.clock.advance(31 * 60 * 1000);
    const r = await request(t.server)
      .post('/v1/auth/password/reset')
      .send({ token, newPassword: 'Totally-New-Pass-55' });
    expect(r.status).toBe(400);
  });
});

describe('customer address book is owner-scoped', () => {
  it('CRUD, default handling, and cross-user access is NOT_FOUND', async () => {
    await t.createUser({ identity: 'addr1@example.test', password: PASSWORD, roles: ['CUSTOMER'] });
    await t.createUser({ identity: 'addr2@example.test', password: PASSWORD, roles: ['CUSTOMER'] });
    const a = await t.login('addr1@example.test', PASSWORD);
    const b = await t.login('addr2@example.test', PASSWORD);
    const body = {
      receiverName: 'Nguyễn Văn A',
      phone: '0912345678',
      province: 'Hà Nội',
      district: 'Cầu Giấy',
      ward: 'Dịch Vọng',
      detail: 'Số 1 ngõ 2',
    };
    const created = await request(t.server)
      .post('/v1/me/addresses')
      .set('Authorization', a.auth)
      .send(body)
      .expect(201);
    expect(created.body.data.isDefault).toBe(true);
    const second = await request(t.server)
      .post('/v1/me/addresses')
      .set('Authorization', a.auth)
      .send({ ...body, detail: 'Số 9', isDefault: true })
      .expect(201);
    const list = await request(t.server)
      .get('/v1/me/addresses')
      .set('Authorization', a.auth)
      .expect(200);
    expect(list.body.data.filter((x: { isDefault: boolean }) => x.isDefault)).toHaveLength(1);
    expect(list.body.data[0].id).toBe(second.body.data.id);

    // B cannot read, patch or delete A's address
    await request(t.server)
      .patch(`/v1/me/addresses/${created.body.data.id}`)
      .set('Authorization', b.auth)
      .send({ detail: 'hack' })
      .expect(404);
    await request(t.server)
      .delete(`/v1/me/addresses/${created.body.data.id}`)
      .set('Authorization', b.auth)
      .expect(404);
    expect(
      (await request(t.server).get('/v1/me/addresses').set('Authorization', b.auth)).body.data,
    ).toEqual([]);

    await request(t.server)
      .post('/v1/me/addresses')
      .set('Authorization', a.auth)
      .send({ ...body, phone: '123' })
      .expect(400);
    await request(t.server)
      .delete(`/v1/me/addresses/${second.body.data.id}`)
      .set('Authorization', a.auth)
      .expect(200);
    const after = await request(t.server)
      .get('/v1/me/addresses')
      .set('Authorization', a.auth)
      .expect(200);
    expect(after.body.data).toHaveLength(1);
    expect(after.body.data[0].isDefault).toBe(true); // default falls back to the remaining address
  });
});
