import request from 'supertest';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import {
  FACTORY_FORBIDDEN_PERMISSIONS,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  ROLE_REALM,
  type Permission,
  type RoleCode,
} from '@bizgo/shared';
import { PERMISSIONS_REQUIRED, REALMS } from '../../src/auth/decorators';
import { totp, base32Decode } from '../../src/common/totp';
import { createTestApp, loginOwner, type TestApp } from '../helpers/app';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const PW = 'Staff-Pass-123456';

describe('MFA for privileged roles (ADR-0002, D20)', () => {
  it('OWNER login yields a pending-MFA session that cannot reach admin APIs until TOTP is verified', async () => {
    await t.createUser({ identity: 'mfa-owner@example.test', password: PW, roles: ['OWNER'] });
    const login = await t.login('mfa-owner@example.test', PW, 'ADMIN');
    expect(login.status).toBe(200);
    expect(login.body.data.mfa).toEqual({ required: true, enrolled: false, verified: false });

    const blocked = await request(t.server)
      .get('/v1/admin/products')
      .set('Authorization', login.auth);
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('MFA_REQUIRED');

    // pending session may still inspect itself and enrol
    const session = await request(t.server)
      .get('/v1/auth/session')
      .set('Authorization', login.auth)
      .expect(200);
    expect(session.body.data.mfa.verified).toBe(false);

    const { secret, recoveryCodes } = await t.completeMfa(login.auth);
    expect(recoveryCodes).toHaveLength(10);
    await request(t.server).get('/v1/admin/products').set('Authorization', login.auth).expect(200);

    // secret is stored encrypted, not in clear text
    const cred = await t.prisma.mfaCredential.findFirstOrThrow();
    expect(Buffer.from(cred.secretEnc).toString('latin1')).not.toContain(secret);
    expect(cred.confirmedAt).not.toBeNull();

    // cannot re-enrol once confirmed
    await request(t.server)
      .post('/v1/auth/mfa/enroll')
      .set('Authorization', login.auth)
      .expect(409);
  });

  it('rejects wrong codes, replay of a used TOTP step, and rate-limits guessing', async () => {
    await t.createUser({ identity: 'mfa2@example.test', password: PW, roles: ['ACCOUNTANT'] });
    const l1 = await t.login('mfa2@example.test', PW, 'ADMIN');
    const { secret } = await t.completeMfa(l1.auth);

    // new login (new session) – the step used during enrolment must not be accepted again
    const l2 = await t.login('mfa2@example.test', PW, 'ADMIN');
    const replay = await request(t.server)
      .post('/v1/auth/mfa/verify')
      .set('Authorization', l2.auth)
      .send({ code: t.totpFor(secret) });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('OTP_INVALID');

    // next step is accepted
    t.clock.advance(30_000);
    await request(t.server)
      .post('/v1/auth/mfa/verify')
      .set('Authorization', l2.auth)
      .send({ code: t.totpFor(secret) })
      .expect(200);

    // brute force: 5 attempts per 15 minutes per user
    const l3 = await t.login('mfa2@example.test', PW, 'ADMIN');
    let last = 0;
    for (let i = 0; i < 8; i++) {
      const r = await request(t.server)
        .post('/v1/auth/mfa/verify')
        .set('Authorization', l3.auth)
        .send({ code: '000000' });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it('recovery codes work once only', async () => {
    await t.createUser({ identity: 'mfa3@example.test', password: PW, roles: ['OWNER'] });
    const l1 = await t.login('mfa3@example.test', PW, 'ADMIN');
    const { recoveryCodes } = await t.completeMfa(l1.auth);
    const code = recoveryCodes[0] as string;

    const l2 = await t.login('mfa3@example.test', PW, 'ADMIN');
    await request(t.server)
      .post('/v1/auth/mfa/verify')
      .set('Authorization', l2.auth)
      .send({ code })
      .expect(200);
    await request(t.server).get('/v1/admin/products').set('Authorization', l2.auth).expect(200);

    const l3 = await t.login('mfa3@example.test', PW, 'ADMIN');
    const again = await request(t.server)
      .post('/v1/auth/mfa/verify')
      .set('Authorization', l3.auth)
      .send({ code });
    expect(again.status).toBe(400);
  });

  it('MFA state survives a refresh (verified session stays verified)', async () => {
    await t.createUser({ identity: 'mfa4@example.test', password: PW, roles: ['OWNER'] });
    const l = await t.login('mfa4@example.test', PW, 'ADMIN');
    await t.completeMfa(l.auth);
    t.clock.advance(16 * 60 * 1000);
    const r = await request(t.server)
      .post('/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: l.refreshToken, realm: 'ADMIN' })
      .expect(200);
    expect(r.body.data.mfa.verified).toBe(true);
    await request(t.server)
      .get('/v1/admin/products')
      .set('Authorization', `Bearer ${r.body.data.accessToken}`)
      .expect(200);
  });

  it('privileged sessions are short-lived (8 h idle / 24 h absolute)', async () => {
    await t.createUser({ identity: 'mfa5@example.test', password: PW, roles: ['OWNER'] });
    const l = await t.login('mfa5@example.test', PW, 'ADMIN');
    t.clock.advance(9 * 60 * 60 * 1000);
    const r = await request(t.server)
      .post('/v1/auth/refresh')
      .set('X-Client', 'mobile')
      .send({ refreshToken: l.refreshToken, realm: 'ADMIN' });
    expect(r.status).toBe(401);
  });

  it('SALES_CS (non-MFA role) can use the admin catalog without MFA', async () => {
    await t.createUser({ identity: 'sales@example.test', password: PW, roles: ['SALES_CS'] });
    const l = await t.login('sales@example.test', PW, 'ADMIN');
    expect(l.body.data.mfa.required).toBe(false);
    await request(t.server).get('/v1/admin/products').set('Authorization', l.auth).expect(200);
  });
});

describe('realm separation and permission guard (UAT-05/06 foundations)', () => {
  it('customers cannot sign into admin/factory realms and vice versa', async () => {
    await t.createUser({ identity: 'cust@example.test', password: PW, roles: ['CUSTOMER'] });
    await t.createUser({ identity: 'fmgr@example.test', password: PW, roles: ['FACTORY_MANAGER'] });
    expect((await t.login('cust@example.test', PW, 'ADMIN')).status).toBe(401);
    expect((await t.login('cust@example.test', PW, 'FACTORY')).status).toBe(401);
    expect((await t.login('fmgr@example.test', PW, 'ADMIN')).status).toBe(401);
    expect((await t.login('fmgr@example.test', PW, 'CUSTOMER')).status).toBe(401);
    expect((await t.login('fmgr@example.test', PW, 'FACTORY')).status).toBe(200);
  });

  it('a factory token is rejected by every admin route and a customer token too', async () => {
    const f = await t.login('fmgr@example.test', PW, 'FACTORY');
    const c = await t.login('cust@example.test', PW, 'CUSTOMER');
    for (const path of [
      '/v1/admin/products',
      '/v1/admin/categories',
      '/v1/admin/audit',
      '/v1/admin/users',
    ]) {
      const rf = await request(t.server).get(path).set('Authorization', f.auth);
      const rc = await request(t.server).get(path).set('Authorization', c.auth);
      expect(rf.status).toBe(401);
      expect(rc.status).toBe(401);
      // no data keys in the error body
      expect(Object.keys(rf.body).sort()).toEqual(['code', 'details', 'message', 'requestId']);
    }
    // and an admin token is useless against the customer area
    await t.createUser({ identity: 'sales2@example.test', password: PW, roles: ['SALES_CS'] });
    const a = await t.login('sales2@example.test', PW, 'ADMIN');
    await request(t.server).get('/v1/me').set('Authorization', a.auth).expect(401);
  });

  it('permission codes are enforced: SALES_CS may read the catalog but not audit/users', async () => {
    const a = await t.login('sales@example.test', PW, 'ADMIN');
    await request(t.server).get('/v1/admin/products').set('Authorization', a.auth).expect(200);
    const audit = await request(t.server).get('/v1/admin/audit').set('Authorization', a.auth);
    expect(audit.status).toBe(403);
    expect(audit.body.code).toBe('FORBIDDEN');
    await request(t.server).get('/v1/admin/users').set('Authorization', a.auth).expect(403);
    const denied = await t.prisma.auditLog.findFirst({
      where: { action: 'auth.forbidden_access' },
    });
    expect(denied).not.toBeNull();
  });

  it('OWNER can read audit and staff lists; staff list excludes customers', async () => {
    const o = await loginOwner(t);
    const users = await request(t.server)
      .get('/v1/admin/users')
      .set('Authorization', o.auth)
      .expect(200);
    expect(users.body.data.every((u: { roles: string[] }) => !u.roles.includes('CUSTOMER'))).toBe(
      true,
    );
    const audit = await request(t.server)
      .get('/v1/admin/audit?limit=5')
      .set('Authorization', o.auth)
      .expect(200);
    expect(audit.body.data.items.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(audit.body)).not.toMatch(/password|token|secret/i);
  });

  it('suspended users lose access immediately', async () => {
    const id = await t.createUser({
      identity: 'susp@example.test',
      password: PW,
      roles: ['CUSTOMER'],
    });
    const l = await t.login('susp@example.test', PW);
    await request(t.server).get('/v1/me').set('Authorization', l.auth).expect(200);
    await t.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await request(t.server).get('/v1/me').set('Authorization', l.auth).expect(401);
    expect((await t.login('susp@example.test', PW)).status).toBe(401);
  });
});

/**
 * Generated permission-matrix test (P1-08): every route that declares permissions is called with a
 * session of every role. A role may pass the permission guard iff it is in the matrix for that realm.
 */
describe('generated permission matrix', () => {
  const routes: { method: string; path: string; realms: string[]; perms: Permission[] }[] = [];

  beforeAll(() => {
    const modules = t.app.get(ModulesContainer);
    const reflector = t.app.get(Reflector);
    const METHODS: Record<number, string> = {
      [RequestMethod.GET]: 'get',
      [RequestMethod.POST]: 'post',
      [RequestMethod.PUT]: 'put',
      [RequestMethod.PATCH]: 'patch',
      [RequestMethod.DELETE]: 'delete',
    };
    const wrappers = [...modules.values()].flatMap((m) => [...m.controllers.values()]);
    for (const w of wrappers) {
      const cls = w.metatype as { prototype: Record<string, unknown> } | null;
      if (!cls) continue;
      const prefix = Reflect.getMetadata('path', cls) as string;
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = cls.prototype[name] as ((...a: unknown[]) => unknown) | undefined;
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const method = Reflect.getMetadata('method', handler) as number | undefined;
        if (method === undefined) continue;
        const sub = (Reflect.getMetadata('path', handler) as string) ?? '';
        const perms =
          reflector.getAllAndOverride<Permission[]>(PERMISSIONS_REQUIRED, [
            handler,
            cls as never,
          ]) ?? [];
        const realms = reflector.getAllAndOverride<string[]>(REALMS, [handler, cls as never]) ?? [
          'CUSTOMER',
        ];
        const path = `/${[prefix, sub].filter((x) => x && x !== '/').join('/')}`.replace(
          /:\w+/g,
          '00000000-0000-4000-8000-000000000000',
        );
        routes.push({ method: METHODS[method] as string, path, realms, perms });
      }
    }
  });

  it('discovers the protected admin routes', () => {
    const protectedRoutes = routes.filter((r) => r.perms.length > 0);
    expect(protectedRoutes.length).toBeGreaterThanOrEqual(5);
  });

  it('allows exactly the roles that the matrix grants, per route', async () => {
    const protectedRoutes = routes.filter((r) => r.perms.length > 0 && r.method === 'get');
    const roleSessions = new Map<RoleCode, string>();
    // One user per role that can sign into the route's realm; MFA roles complete TOTP first.
    for (const role of ROLE_CODES) {
      const realm = ROLE_REALM[role];
      const id = `matrix-${role.toLowerCase()}@example.test`;
      await t.createUser({ identity: id, password: PW, roles: [role] });
      const l = await t.login(id, PW, realm);
      expect(l.status, `login ${role}`).toBe(200);
      if (l.body.data.mfa.required) await t.completeMfa(l.auth);
      roleSessions.set(role, l.auth);
    }
    let assertions = 0;
    for (const route of protectedRoutes) {
      for (const role of ROLE_CODES) {
        const auth = roleSessions.get(role) as string;
        const agent = request(t.server);
        const res = await agent[route.method as 'get'](route.path).set('Authorization', auth);
        const realmOk = route.realms.includes(ROLE_REALM[role]);
        const granted = route.perms.every((p) =>
          (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(p),
        );
        const label = `${role} ${route.method.toUpperCase()} ${route.path}`;
        if (!realmOk) expect(res.status, label).toBe(401);
        else if (!granted) expect(res.status, label).toBe(403);
        else expect([200, 404, 400], label).toContain(res.status); // passed the guard (handler decides)
        assertions++;
      }
    }
    expect(assertions).toBeGreaterThanOrEqual(5 * ROLE_CODES.length);
  });

  it('no factory role holds a finance/pricing/PII permission in the seeded DB (UAT-06 guard)', async () => {
    for (const code of ['FACTORY_MANAGER', 'FACTORY_STAFF']) {
      const role = await t.prisma.role.findUniqueOrThrow({
        where: { code },
        include: { permissions: { include: { permission: true } } },
      });
      const granted = role.permissions.map((p) => p.permission.code);
      for (const f of FACTORY_FORBIDDEN_PERMISSIONS) expect(granted).not.toContain(f);
    }
  });
});

describe('X-Realm hint on multi-realm endpoints', () => {
  it('uses the hinted realm cookie even when another realm cookie is also present', async () => {
    await t.createUser({ identity: 'hint-c@example.test', password: PW, roles: ['CUSTOMER'] });
    await t.createUser({ identity: 'hint-s@example.test', password: PW, roles: ['SALES_CS'] });
    const agent = request.agent(t.server);
    await agent
      .post('/v1/auth/login')
      .send({ identity: 'hint-c@example.test', password: PW, realm: 'CUSTOMER' })
      .expect(200);
    await agent
      .post('/v1/auth/login')
      .send({ identity: 'hint-s@example.test', password: PW, realm: 'ADMIN' })
      .expect(200);
    const admin = await agent.get('/v1/auth/session').set('X-Realm', 'ADMIN').expect(200);
    expect(admin.body.data.user.realm).toBe('ADMIN');
    const cust = await agent.get('/v1/auth/session').set('X-Realm', 'CUSTOMER').expect(200);
    expect(cust.body.data.user.realm).toBe('CUSTOMER');
  });
});

describe('step-up helper compiles against the shared TOTP implementation', () => {
  it('accepts a code generated from the enrolment secret', () => {
    const secret = Buffer.from('12345678901234567890');
    expect(totp(secret, 59_000)).toHaveLength(6);
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').toString()).toBe(
      '12345678901234567890',
    );
  });
});
