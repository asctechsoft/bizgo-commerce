import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { PrismaClient } from '@bizgo/db';
import { bootstrapOwner } from '../auth/owner-bootstrap';

/** Reads a line without echoing it (password prompt). */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const out = new Writable({
      write(chunk, _enc, cb) {
        if (!muted) process.stdout.write(chunk);
        cb();
      },
    });
    const rl = createInterface({ input: process.stdin, output: out, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const email = process.env.OWNER_EMAIL ?? (await promptHidden('Owner email: '));
  const displayName = process.env.OWNER_DISPLAY_NAME ?? 'Chủ sở hữu BizGo';
  const password =
    process.env.OWNER_PASSWORD ?? (await promptHidden('Owner password (min 10 chars): '));
  const prisma = new PrismaClient();
  try {
    const { userId } = await bootstrapOwner(prisma, { email, displayName, password });
    console.log(
      `OWNER created (${userId}). Sign in at /admin/login and enrol TOTP on first login.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
