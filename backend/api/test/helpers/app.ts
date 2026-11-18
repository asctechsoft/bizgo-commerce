import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { PrismaClient, seedAll } from '@bizgo/db';
import { cloneTestDatabase } from '@bizgo/db/testing';
import type { RoleCode } from '@bizgo/shared';
import { ROLE_REALM } from '@bizgo/shared';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { Clock } from '../../src/common/clock';
import { loadConfig, type AppConfig } from '../../src/config/env';
import { DevConsoleTransport } from '../../src/auth/message-transport';
import { PasswordService } from '../../src/auth/password.service';
import { base32Decode, totp } from '../../src/common/totp';

export class TestClock extends Clock {
  private t = Date.now();
  now(): Date {
    return new Date(this.t);
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export interface TestApp {
  app: INestApplication;
  config: AppConfig;
  prisma: PrismaClient;
  clock: TestClock;
  transport: DevConsoleTransport;
  server: ReturnType<INestApplication['getHttpServer']>;
  /** Create a verified, ACTIVE user with the given roles (password hashed with the real Argon2id). */
  createUser(input: {
    identity: string;
    password: string;
    roles: RoleCode[];
    displayName?: string;
  }): Promise<string>;
  /** Log in with bearer tokens (X-Client: mobile). Returns the Authorization header value + csrf. */
  login(
    identity: string,
    password: string,
    realm?: 'CUSTOMER' | 'ADMIN' | 'FACTORY',
  ): Promise<{
    status: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: arbitrary JSON envelope
    body: any;
    auth: string;
    refreshToken: string;
  }>;
  /** Full MFA enrolment + verification for a privileged session. Returns recovery codes. */
  completeMfa(auth: string): Promise<{ secret: string; recoveryCodes: string[] }>;
  totpFor(secretBase32: string): string;
  close(): Promise<void>;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const db = await cloneTestDatabase();
  const config = loadConfig({
    APP_ENV: 'test',
    DATABASE_URL: db.url,
    APP_SECRET: 'test-secret-'.padEnd(48, 'x'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    DEV_OTP_CONSOLE: 'true',
    RATE_LIMIT_IP_MULTIPLIER: '1000', // all supertest calls share one IP; per-identity limits stay real
    CORS_ORIGINS: 'http://localhost:3000',
    ...env,
  } as NodeJS.ProcessEnv);

  const clock = new TestClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, config);
  await app.init();
  // Listen once: supertest closes a server it started itself, which resets parallel in-flight requests.
  await app.listen(0, '127.0.0.1');

  const prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await seedAll(prisma);
  const passwords = moduleRef.get(PasswordService);
  const transport = moduleRef.get(DevConsoleTransport);
  const server = app.getHttpServer();

  const api: TestApp = {
    app,
    config,
    prisma,
    clock,
    transport,
    server,
    async createUser({ identity, password, roles, displayName }) {
      const type = identity.includes('@') ? 'EMAIL' : 'PHONE';
      const roleRows = await prisma.role.findMany({ where: { code: { in: roles } } });
      const user = await prisma.user.create({
        data: {
          displayName: displayName ?? identity,
          status: 'ACTIVE',
          identities: {
            create: { type, valueNorm: identity.toLowerCase(), verifiedAt: new Date() },
          },
          passwordCredential: { create: { hash: await passwords.hash(password) } },
          roles: { create: roleRows.map((r) => ({ roleId: r.id })) },
        },
      });
      return user.id;
    },
    async login(identity, password, realm) {
      const res = await request(server)
        .post('/v1/auth/login')
        .set('X-Client', 'mobile')
        .send({ identity, password, ...(realm ? { realm } : {}) });
      return {
        status: res.status,
        body: res.body,
        auth: `Bearer ${res.body?.data?.accessToken ?? ''}`,
        refreshToken: res.body?.data?.refreshToken ?? '',
      };
    },
    totpFor(secretBase32) {
      return totp(base32Decode(secretBase32), clock.now().getTime());
    },
    async completeMfa(auth) {
      const enroll = await request(server)
        .post('/v1/auth/mfa/enroll')
        .set('Authorization', auth)
        .expect(200);
      const secret = enroll.body.data.secret as string;
      const verify = await request(server)
        .post('/v1/auth/mfa/verify')
        .set('Authorization', auth)
        .send({ code: api.totpFor(secret) })
        .expect(200);
      return { secret, recoveryCodes: verify.body.data.recoveryCodes as string[] };
    },
    async close() {
      await app.close();
      await prisma.$disconnect();
      await db.drop();
    },
  };
  void ROLE_REALM;
  return api;
}

/** Convenience: an OWNER with MFA completed, ready for admin calls. */
export async function loginOwner(t: TestApp): Promise<{ auth: string; secret: string }> {
  await t.createUser({
    identity: 'owner@example.test',
    password: 'Owner-Pass-12345',
    roles: ['OWNER'],
  });
  const login = await t.login('owner@example.test', 'Owner-Pass-12345', 'ADMIN');
  if (login.status !== 200) throw new Error(`owner login failed: ${JSON.stringify(login.body)}`);
  const { secret } = await t.completeMfa(login.auth);
  return { auth: login.auth, secret };
}
