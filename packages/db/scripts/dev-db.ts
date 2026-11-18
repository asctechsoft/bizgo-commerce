/**
 * Local development database WITHOUT Docker: an embedded PostgreSQL that persists in ./.embedded-pg.
 *   pnpm --filter @bizgo/db dev:db
 * It initialises (UTF8), starts on DEV_DB_PORT (default 54329), creates the `bizgo` database, applies
 * every Prisma migration and seeds the 82 DRAFT products, then keeps running until Ctrl+C.
 * Docker Compose (infra/docker) is the supported way for staging-like runs.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import EmbeddedPostgres from 'embedded-postgres';
import { findRepoRoot } from '../src/repo-root';

const require = createRequire(import.meta.url);

async function main() {
  const root = findRepoRoot();
  const dir = join(root, '.embedded-pg');
  const port = Number(process.env.DEV_DB_PORT ?? 54329);
  const password = process.env.DEV_DB_PASSWORD ?? 'bizgo_dev_only';
  const fresh = !existsSync(join(dir, 'PG_VERSION'));
  mkdirSync(dir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password,
    port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => undefined,
    onError: (e) => console.error(String(e)),
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('bizgo');

  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/bizgo?schema=public`;
  const prismaCli = require.resolve('prisma/build/index.js');
  execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', join(root, 'prisma', 'schema.prisma')],
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    },
  );
  const { PrismaClient } = await import('@prisma/client');
  const { seedAll } = await import('../src/seed/seed');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  console.log('Seed:', JSON.stringify(await seedAll(prisma)));
  await prisma.$disconnect();

  console.log(`\nDev database ready:\n  DATABASE_URL=${url}\nPress Ctrl+C to stop.\n`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
