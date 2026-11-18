import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('API foundation (P1-05)', () => {
  it('liveness and readiness (DB check)', async () => {
    const live = await request(t.server).get('/health/live').expect(200);
    expect(live.body).toEqual({ status: 'ok' });
    const ready = await request(t.server).get('/health/ready').expect(200);
    expect(ready.body.checks.database).toBe('up');
  });

  it('wraps successes in {data, meta.requestId} and echoes a valid X-Request-Id', async () => {
    const res = await request(t.server)
      .get('/v1/categories')
      .set('X-Request-Id', 'req-12345678')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('req-12345678');
    expect(res.body.meta.requestId).toBe('req-12345678');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('generates a request id when none/invalid is supplied', async () => {
    const res = await request(t.server)
      .get('/v1/categories')
      .set('X-Request-Id', 'bad id with spaces')
      .expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the documented error envelope for validation failures', async () => {
    const res = await request(t.server).get('/v1/products?limit=1000&sort=price').expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(typeof res.body.message).toBe('string');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
    expect(res.body.requestId).toBeTruthy();
  });

  it('rejects unknown/extra body properties (whitelist)', async () => {
    const res = await request(t.server)
      .post('/v1/auth/login')
      .send({ identity: 'a@b.co', password: 'x', isAdmin: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('unknown routes use the NOT_FOUND envelope without stack traces', async () => {
    const res = await request(t.server).get('/v1/nope').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.(ts|js):\d+/);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(t.server).get('/v1/categories');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('CORS allows only configured origins', async () => {
    const ok = await request(t.server).get('/v1/categories').set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(t.server).get('/v1/categories').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
