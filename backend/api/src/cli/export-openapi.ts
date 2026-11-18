import 'reflect-metadata';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { findRepoRoot } from '@bizgo/db';
import { AppModule } from '../app.module';
import { buildOpenApi } from '../bootstrap';
import { loadConfig } from '../config/env';

/**
 * Generates docs/api/openapi.json from the real controllers/DTOs (no database connection is made).
 *   --check   exit 1 if the committed file differs (CI drift check)
 */
async function main() {
  const check = process.argv.includes('--check');
  const config = loadConfig({
    APP_ENV: 'local',
    DATABASE_URL: 'postgresql://openapi:export@127.0.0.1:1/none',
    PRISMA_SKIP_CONNECT: 'true',
    APP_SECRET: 'openapi-export-secret-'.padEnd(48, 'x'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  } as NodeJS.ProcessEnv);
  const app = await NestFactory.create(AppModule.forRoot(config), { logger: false });
  await app.init();
  const doc = buildOpenApi(app);
  await app.close();

  const json = `${JSON.stringify(doc, null, 2)}
`;
  const target = join(findRepoRoot(), 'docs', 'api', 'openapi.json');
  if (check) {
    const current = existsSync(target) ? readFileSync(target, 'utf-8') : '';
    if (current !== json) {
      console.error(
        'OpenAPI drift: docs/api/openapi.json is out of date. Run `pnpm --filter @bizgo/api openapi:export`.',
      );
      process.exit(1);
    }
    console.log('OpenAPI contract is up to date.');
    return;
  }
  writeFileSync(target, json, 'utf-8');
  console.log(`Wrote ${target} (${Object.keys(doc.paths).length} paths)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
