/**
 * Real-PostgreSQL test harness (ADR-0014): no SQLite, no mocks for orders/stock/idempotency.
 * Starts an embedded PostgreSQL (npm binaries, no Docker needed), applies all Prisma migrations to a
 * template database once, and clones a fresh database per test file (CREATE DATABASE ... TEMPLATE).
 *
 * If BIZGO_TEST_DATABASE_URL (a server URL with superuser rights, e.g. a CI service container) is set,
 * that server is used instead of starting an embedded one.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';

const require = createRequire(import.meta.url);
const TEMPLATE_DB = 'bizgo_template';

export interface PgServer {
  /** Connection URL for a given database name. */
  urlFor(db: string): string;
  /** Run SQL on the maintenance database. */
  adminQuery(sql: string): Promise<void>;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => res(port));
    });
  });
}

export async function startPgServer(): Promise<PgServer> {
  const external = process.env.BIZGO_TEST_DATABASE_URL;
  if (external) {
    const base = new URL(external);
    const { Client } = await import('pg');
    const adminQuery = async (sql: string) => {
      const c = new Client({ connectionString: base.toString() });
      await c.connect();
      try {
        await c.query(sql);
      } finally {
        await c.end();
      }
    };
    return {
      urlFor: (db) => {
        const u = new URL(base.toString());
        u.pathname = `/${db}`;
        return u.toString();
      },
      adminQuery,
      stop: async () => undefined,
    };
  }

  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'bizgo-pg-'));
  const user = 'postgres';
  const password = randomBytes(12).toString('hex');
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user,
    password,
    port,
    persistent: false,
    // Vietnamese text requires UTF8 regardless of the Windows ANSI code page (WIN1252 by default).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => undefined,
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  const urlFor = (db: string) =>
    `postgresql://${user}:${password}@127.0.0.1:${port}/${db}?schema=public`;
  return {
    urlFor,
    adminQuery: async (sql) => {
      const client = pg.getPgClient();
      await client.connect();
      try {
        await client.query(sql);
      } finally {
        await client.end();
      }
    },
    stop: async () => {
      await pg.stop();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    },
  };
}

/** Apply every migration in prisma/migrations to `databaseUrl` with the real Prisma CLI. */
export function prismaMigrateDeploy(databaseUrl: string, repoRoot: string): void {
  const cli = require.resolve('prisma/build/index.js');
  try {
    execFileSync(
      process.execPath,
      [cli, 'migrate', 'deploy', '--schema', resolve(repoRoot, 'prisma', 'schema.prisma')],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' },
    );
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed:
${err.stdout?.toString() ?? ''}
${err.stderr?.toString() ?? ''}`,
    );
  }
}

/** Create the migrated template database once per test run. */
export async function createTemplate(server: PgServer, repoRoot: string): Promise<void> {
  await server.adminQuery(`CREATE DATABASE ${TEMPLATE_DB} ENCODING 'UTF8' TEMPLATE template0`);
  prismaMigrateDeploy(server.urlFor(TEMPLATE_DB), repoRoot);
}

/** Clone a fresh, fully migrated database. Returns its URL and a cleanup function. */
export async function cloneDatabase(
  server: PgServer,
): Promise<{ url: string; name: string; drop: () => Promise<void> }> {
  const name = `t_${randomBytes(6).toString('hex')}`;
  await server.adminQuery(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`);
  return {
    url: server.urlFor(name),
    name,
    drop: async () => {
      await server.adminQuery(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    },
  };
}
