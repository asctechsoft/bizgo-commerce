import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  TRUST_PROXY: bool,
  /** Secret used to HMAC session csrf tokens, OTP codes and ip hashes. >= 32 chars. */
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  /** 32 random bytes, hex or base64, used for AES-256-GCM of MFA secrets. */
  MFA_ENCRYPTION_KEY: z.string().min(32),
  COOKIE_DOMAIN: z.string().optional(),
  DEV_OTP_CONSOLE: bool,
  SEED_TEST_FIXTURES: bool,
  NEXT_PUBLIC_DEMO_FIXTURES: bool,
  SWAGGER_ENABLED: bool,
  /** Build/CI tooling only (OpenAPI export): do not connect to the database on boot. */
  PRISMA_SKIP_CONNECT: bool,
  /** Multiplies per-IP rate-limit budgets (tests only; must stay 1 in staging/production). */
  RATE_LIMIT_IP_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = Omit<z.infer<typeof schema>, 'CORS_ORIGINS'> & {
  CORS_ORIGINS: string[];
  isProduction: boolean;
  cookieSecure: boolean;
};

export const APP_CONFIG = Symbol('APP_CONFIG');

const WEAK_SECRETS = new Set(['changeme', 'secret', 'password', 'dummy', 'example']);

/** Validate environment and apply production fail-closed rules (ADR-0013). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  const raw = parsed.data;
  const cfg: AppConfig = {
    ...raw,
    CORS_ORIGINS: raw.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    isProduction: raw.APP_ENV === 'production',
    cookieSecure: raw.APP_ENV === 'production' || raw.APP_ENV === 'staging',
  };

  if (cfg.APP_ENV === 'production' || cfg.APP_ENV === 'staging') {
    const problems: string[] = [];
    if (cfg.APP_ENV === 'production') {
      if (cfg.DEV_OTP_CONSOLE) problems.push('DEV_OTP_CONSOLE must be false');
      if (cfg.SEED_TEST_FIXTURES) problems.push('SEED_TEST_FIXTURES must be false');
      if (cfg.NEXT_PUBLIC_DEMO_FIXTURES) problems.push('NEXT_PUBLIC_DEMO_FIXTURES must be false');
      if (!cfg.REDIS_URL) problems.push('REDIS_URL is required (rate limiting must be shared)');
    }
    if (cfg.CORS_ORIGINS.includes('*') || cfg.CORS_ORIGINS.length === 0) {
      problems.push('CORS_ORIGINS must be an explicit allow-list');
    }
    if (cfg.PRISMA_SKIP_CONNECT) problems.push('PRISMA_SKIP_CONNECT must be false');
    if (cfg.RATE_LIMIT_IP_MULTIPLIER !== 1) problems.push('RATE_LIMIT_IP_MULTIPLIER must be 1');
    if (WEAK_SECRETS.has(cfg.APP_SECRET.toLowerCase()))
      problems.push('APP_SECRET is a placeholder');
    if (problems.length)
      throw new Error(`Unsafe ${cfg.APP_ENV} configuration: ${problems.join('; ')}`);
  }
  return cfg;
}
