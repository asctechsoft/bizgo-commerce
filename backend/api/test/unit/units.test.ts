import { base32Decode, base32Encode, hotp, verifyTotp } from '../../src/common/totp';
import { canonicalHash } from '../../src/common/crypto';
import { loadConfig } from '../../src/config/env';
import { detectIdentityType, maskIdentity, normalizeIdentity } from '../../src/auth/identity';
import { assertPasswordPolicy } from '../../src/auth/password.service';
import { redactForAudit } from '../../src/infra/audit.service';
import { MemoryRateLimiter } from '../../src/infra/rate-limiter';
import { Clock } from '../../src/common/clock';
import { randomBytes } from 'node:crypto';

describe('TOTP (RFC 6238 test vectors, SHA-1, 8 digits)', () => {
  const secret = Buffer.from('12345678901234567890');
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  it.each(vectors)('time %i → %s', (t, expected) => {
    expect(hotp(secret, Math.floor(t / 30), 8)).toBe(expected);
  });

  it('verifies within ±1 step and rejects outside the window', () => {
    const t = 1_700_000_000_000;
    const step = Math.floor(t / 1000 / 30);
    const code = hotp(secret, step);
    expect(verifyTotp(secret, code, t)).toBe(step);
    expect(verifyTotp(secret, code, t + 30_000)).toBe(step);
    expect(verifyTotp(secret, code, t + 120_000)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', t)).toBeNull();
  });

  it('round-trips base32', () => {
    const buf = randomBytes(20);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
});

describe('identity normalisation', () => {
  it('normalises Vietnamese phone formats', () => {
    for (const raw of ['0912345678', '+84912345678', '84 912 345 678', '091-234-5678']) {
      expect(normalizeIdentity('PHONE', raw)).toBe('0912345678');
    }
  });
  it('rejects malformed values', () => {
    expect(() => normalizeIdentity('PHONE', '12345')).toThrow();
    expect(() => normalizeIdentity('EMAIL', 'not-an-email')).toThrow();
  });
  it('lowercases emails, detects type and masks', () => {
    expect(normalizeIdentity('EMAIL', ' A.B@Example.COM ')).toBe('a.b@example.com');
    expect(detectIdentityType('a@b.co')).toBe('EMAIL');
    expect(detectIdentityType('0912345678')).toBe('PHONE');
    expect(maskIdentity('EMAIL', 'abcdef@example.com')).toBe('ab***@example.com');
    expect(maskIdentity('PHONE', '0912345678')).toBe('091****678');
  });
});

describe('password policy', () => {
  it('enforces length, deny-list and identity reuse', () => {
    expect(() => assertPasswordPolicy('short')).toThrow(/10/);
    expect(() => assertPasswordPolicy('1234567890')).toThrow(/phổ biến/);
    expect(() => assertPasswordPolicy('xxxxxxxxxxxxxxxx'.repeat(9))).toThrow(/128/);
    expect(() => assertPasswordPolicy('myjohnsmith-pass', 'johnsmith@example.com')).toThrow(
      /thông tin/,
    );
    expect(() => assertPasswordPolicy('Correct-Horse-9', 'a@b.co')).not.toThrow();
  });
});

describe('canonicalHash (idempotency request hash)', () => {
  it('is independent of key order and sensitive to values', () => {
    expect(canonicalHash({ a: 1, b: { c: [1, 2], d: null } })).toBe(
      canonicalHash({ b: { d: null, c: [1, 2] }, a: 1 }),
    );
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }));
  });
});

describe('audit redaction', () => {
  it('redacts secrets and serialises bigint/dates', () => {
    const out = redactForAudit({
      password: 'x',
      nested: { token: 't', codeHmac: 'h', ok: 1 },
      amount: 5n,
      at: new Date('2026-01-01T00:00:00Z'),
    }) as Record<string, unknown>;
    expect(out.password).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).codeHmac).toBe('[REDACTED]');
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect(out.amount).toBe('5');
    expect(out.at).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('MemoryRateLimiter', () => {
  class FakeClock extends Clock {
    t = 0;
    now() {
      return new Date(this.t);
    }
  }
  it('limits within a window and resets after it', async () => {
    const clock = new FakeClock();
    const rl = new MemoryRateLimiter(clock);
    for (let i = 0; i < 3; i++) expect((await rl.hit('k', 3, 60)).allowed).toBe(true);
    const blocked = await rl.hit('k', 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    clock.t += 61_000;
    expect((await rl.hit('k', 3, 60)).allowed).toBe(true);
  });
});

describe('configuration safety (ADR-0013)', () => {
  const base = {
    DATABASE_URL: 'postgresql://x',
    APP_SECRET: 'a-very-long-secret-value-with-32-plus-chars',
    MFA_ENCRYPTION_KEY: 'f'.repeat(64),
  };
  it('accepts a safe local configuration', () => {
    expect(loadConfig({ ...base, APP_ENV: 'local' } as NodeJS.ProcessEnv).DEV_OTP_CONSOLE).toBe(
      false,
    );
  });
  it('refuses production with dev OTP console, fixtures or demo flags', () => {
    const prod = {
      ...base,
      APP_ENV: 'production',
      REDIS_URL: 'redis://x',
      CORS_ORIGINS: 'https://bizgo.example',
    };
    expect(() => loadConfig({ ...prod, DEV_OTP_CONSOLE: 'true' } as NodeJS.ProcessEnv)).toThrow(
      /DEV_OTP_CONSOLE/,
    );
    expect(() => loadConfig({ ...prod, SEED_TEST_FIXTURES: 'true' } as NodeJS.ProcessEnv)).toThrow(
      /SEED_TEST_FIXTURES/,
    );
    expect(() =>
      loadConfig({ ...prod, NEXT_PUBLIC_DEMO_FIXTURES: 'true' } as NodeJS.ProcessEnv),
    ).toThrow(/DEMO/);
  });
  it('refuses production without Redis or with wildcard CORS', () => {
    const prod = { ...base, APP_ENV: 'production', CORS_ORIGINS: 'https://bizgo.example' };
    expect(() => loadConfig(prod as NodeJS.ProcessEnv)).toThrow(/REDIS_URL/);
    expect(() =>
      loadConfig({ ...prod, REDIS_URL: 'redis://x', CORS_ORIGINS: '*' } as NodeJS.ProcessEnv),
    ).toThrow(/CORS/);
  });
  it('requires strong secrets', () => {
    expect(() =>
      loadConfig({ ...base, APP_SECRET: 'short', APP_ENV: 'local' } as NodeJS.ProcessEnv),
    ).toThrow(/APP_SECRET/);
  });
});
