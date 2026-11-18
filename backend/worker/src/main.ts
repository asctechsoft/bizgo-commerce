import { PrismaClient } from '@bizgo/db';
import { OutboxPublisher, type OutboxHandler } from './outbox-publisher';

/**
 * Worker entrypoint (ADR-0007). Phase 1 registers no business handlers yet: events are persisted and
 * marked PUBLISHED. Notification / email / webhook handlers are added in later phases and MUST be
 * idempotent. Real channels stay disabled until D15 is answered.
 */
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient();
  const handlers: Record<string, OutboxHandler> = {
    'user.registered': async (e) => console.log(`[outbox] ${e.type} ${e.aggregateId}`),
    'user.verified': async (e) => console.log(`[outbox] ${e.type} ${e.aggregateId}`),
  };
  const publisher = new OutboxPublisher(prisma, handlers);
  const pollMs = Number(process.env.OUTBOX_POLL_MS ?? 2000);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`BizGo worker started (poll ${pollMs} ms)`);
  while (!stopping) {
    try {
      const r = await publisher.runOnce();
      if (r.claimed === 0) await new Promise((res) => setTimeout(res, pollMs));
    } catch (e) {
      console.error('[outbox] poll failed', e instanceof Error ? e.message : e);
      await new Promise((res) => setTimeout(res, pollMs * 2));
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
