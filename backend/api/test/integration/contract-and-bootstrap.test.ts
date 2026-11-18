import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { findRepoRoot } from '@bizgo/db';
import { buildOpenApi } from '../../src/bootstrap';
import { bootstrapOwner } from '../../src/auth/owner-bootstrap';
import { createTestApp, type TestApp } from '../helpers/app';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('OpenAPI contract (P1-10)', () => {
  it('committed docs/api/openapi.json matches the contract generated from code (no drift)', () => {
    const generated = `${JSON.stringify(buildOpenApi(t.app), null, 2)}\n`;
    const committed = readFileSync(join(findRepoRoot(), 'docs', 'api', 'openapi.json'), 'utf-8');
    expect(generated).toBe(committed);
  });

  it('documents the public, auth, me and admin surfaces and declares an error envelope', () => {
    const doc = buildOpenApi(t.app) as { paths: Record<string, unknown> };
    for (const p of [
      '/v1/categories',
      '/v1/products',
      '/v1/products/{slug}',
      '/v1/auth/login',
      '/v1/auth/mfa/verify',
      '/v1/me/addresses',
      '/v1/admin/products',
    ]) {
      expect(Object.keys(doc.paths)).toContain(p);
    }
  });
});

describe('owner bootstrap CLI logic (ADR-0002)', () => {
  it('creates the first OWNER with a run-time password (no default), refuses a second one', async () => {
    const { userId } = await bootstrapOwner(t.prisma, {
      email: 'First.Owner@Example.test',
      displayName: 'Chủ sở hữu',
      password: 'Initial-Owner-Pass-1',
    });
    const roles = await t.prisma.userRole.findMany({ where: { userId }, include: { role: true } });
    expect(roles.map((r) => r.role.code)).toEqual(['OWNER']);
    const ident = await t.prisma.identity.findFirstOrThrow({ where: { userId } });
    expect(ident.valueNorm).toBe('first.owner@example.test');
    expect(ident.verifiedAt).not.toBeNull();
    await expect(
      bootstrapOwner(t.prisma, {
        email: 'second@example.test',
        displayName: 'X Y',
        password: 'Different-Strong-Pass-2',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    // the new owner must complete MFA before any admin API works
    const login = await t.login('first.owner@example.test', 'Initial-Owner-Pass-1', 'ADMIN');
    expect(login.status).toBe(200);
    expect(login.body.data.mfa).toEqual({ required: true, enrolled: false, verified: false });
    const blocked = await request(t.server)
      .get('/v1/admin/products')
      .set('Authorization', login.auth);
    expect(blocked.body.code).toBe('MFA_REQUIRED');
  });

  it('rejects weak passwords', async () => {
    await expect(
      bootstrapOwner(t.prisma, {
        email: 'weak@example.test',
        displayName: 'X Y',
        password: 'short',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
