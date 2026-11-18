import { createTemplate, startPgServer, type PgServer } from './pg';
import { findRepoRoot } from '../src/repo-root';

let server: PgServer | undefined;

/** Vitest globalSetup: one PostgreSQL server + one migrated template DB per test run. */
export default async function setup(): Promise<() => Promise<void>> {
  const root = findRepoRoot();
  server = await startPgServer();
  await createTemplate(server, root);
  // Expose server coordinates to test workers through env (set before workers spawn).
  process.env.BIZGO_PG_URL_TEMPLATE = server.urlFor('__DB__');
  return async () => {
    await server?.stop();
  };
}
