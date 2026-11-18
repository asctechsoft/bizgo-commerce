#!/usr/bin/env node
/**
 * One-command local stack (no Docker): embedded PostgreSQL -> TEST fixtures -> dev OWNER -> API -> storefront -> backoffice.
 *   node scripts/dev-stack.mjs build   # build API + both web apps (production builds)
 *   node scripts/dev-stack.mjs start   # start everything (Ctrl+C stops all)
 * LOCAL DEVELOPMENT ONLY: uses throw-away secrets and TEST fixtures; refuses APP_ENV=production.
 */
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const mode = process.argv[2] ?? 'start';
if (process.env.APP_ENV === 'production')
  throw new Error('dev-stack is for local development only');

const PNPM = 'pnpm --config.manage-package-manager-versions=false';
const DB_URL = 'postgresql://postgres:bizgo_dev_only@127.0.0.1:54329/bizgo?schema=public';
const env = {
  ...process.env,
  APP_ENV: 'local',
  PORT: '4000',
  DEV_OTP_CONSOLE: 'true',
  DATABASE_URL: DB_URL,
  APP_SECRET: 'local-dev-secret-local-dev-secret-0123',
  MFA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
  API_BASE_URL: 'http://localhost:4000',
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  OWNER_EMAIL: process.env.OWNER_EMAIL ?? 'owner@bizgo.local',
  OWNER_PASSWORD: process.env.OWNER_PASSWORD ?? 'Bz-Dev-Only-Pass-98765',
};

function runSync(cmd, label) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', env });
  if (r.status !== 0) {
    console.error(`✖ ${label} failed`);
    process.exit(r.status ?? 1);
  }
}

if (mode === 'build') {
  runSync(`${PNPM} --filter @bizgo/shared build`, 'build shared');
  runSync(`${PNPM} --filter @bizgo/db build`, 'build db');
  runSync(`${PNPM} --filter @bizgo/api build`, 'build api');
  runSync(`${PNPM} --filter @bizgo/storefront-web build`, 'build storefront');
  runSync(`${PNPM} --filter @bizgo/backoffice-web build`, 'build backoffice');
  console.log('\n✔ build done. Run: node scripts/dev-stack.mjs start');
  process.exit(0);
}

const children = [];
function start(name, cmd, readyRe) {
  return new Promise((resolve) => {
    const p = spawn(cmd, { shell: true, env });
    children.push(p);
    let ready = !readyRe;
    const onData = (d) => {
      const s = d.toString();
      process.stdout.write(`[${name}] ${s}`);
      if (!ready && readyRe.test(s)) {
        ready = true;
        resolve();
      }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('exit', (c) => console.log(`[${name}] exited (${c})`));
    if (ready) resolve();
  });
}

function stopAll() {
  for (const c of children) {
    if (process.platform === 'win32') spawnSync(`taskkill /pid ${c.pid} /T /F`, { shell: true });
    else c.kill('SIGTERM');
  }
  process.exit(0);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

const dbUp = await new Promise((res) => {
  const sock = net.connect(54329, '127.0.0.1');
  sock.on('connect', () => (sock.destroy(), res(true)));
  sock.on('error', () => res(false));
});
if (dbUp) console.log('ℹ PostgreSQL already listening on 54329 - reusing it');
else await start('db', `${PNPM} --filter @bizgo/db dev:db`, /Dev database ready/);
runSync(`${PNPM} --filter @bizgo/db dev:fixtures`, 'load TEST fixtures');
const owner = spawnSync(`${PNPM} --filter @bizgo/api owner:bootstrap`, {
  shell: true,
  env,
  encoding: 'utf8',
});
console.log(
  owner.status === 0
    ? `\n✔ OWNER dev: ${env.OWNER_EMAIL} / ${env.OWNER_PASSWORD}`
    : `\nℹ OWNER already exists or bootstrap skipped: ${(owner.stdout + owner.stderr).trim().split('\n').pop()}`,
);
await start('api', `node backend/api/dist/main.js`, /listening on/);
await start('storefront', `${PNPM} --filter @bizgo/storefront-web start`, /Ready|ready|started/);
await start('backoffice', `${PNPM} --filter @bizgo/backoffice-web start`, /Ready|ready|started/);
console.log(`
══════════════════════════════════════════════
  Storefront : http://localhost:3000
  Backoffice : http://localhost:3001/admin/login
  API        : http://localhost:4000  (OTP codes print in the [api] log)
  OWNER dev  : ${env.OWNER_EMAIL} / ${env.OWNER_PASSWORD}  (enrol TOTP on first login)
══════════════════════════════════════════════`);
