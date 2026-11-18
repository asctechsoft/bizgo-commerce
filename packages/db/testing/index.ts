import { Client } from 'pg';
import { randomBytes } from 'node:crypto';

/**
 * Worker-side helper: clone a migrated database from the template prepared by global-setup.
 * Uses BIZGO_PG_URL_TEMPLATE ("...@host:port/__DB__...") exported by global-setup.
 */
const TEMPLATE_DB = 'bizgo_template';

function urlFor(db: string): string {
  const tpl = process.env.BIZGO_PG_URL_TEMPLATE;
  if (!tpl) throw new Error('BIZGO_PG_URL_TEMPLATE not set: is the vitest globalSetup configured?');
  return tpl.replace('__DB__', db);
}

export async function cloneTestDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `t_${randomBytes(6).toString('hex')}`;
  const admin = new Client({ connectionString: urlFor('postgres') });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }
  return {
    url: urlFor(name),
    drop: async () => {
      const a = new Client({ connectionString: urlFor('postgres') });
      await a.connect();
      try {
        await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await a.end();
      }
    },
  };
}
