import { PrismaClient } from '@bizgo/db';
import { cloneTestDatabase } from '@bizgo/db/testing';
import { OutboxPublisher, type OutboxRow } from '../src/outbox-publisher';

let prisma: PrismaClient;
let drop: () => Promise<void>;

beforeAll(async () => {
  const db = await cloneTestDatabase();
  drop = db.drop;
  prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});
beforeEach(async () => {
  await prisma.processedEvent.deleteMany();
  await prisma.outboxEvent.deleteMany();
});

const add = (type: string, id: string) =>
  prisma.outboxEvent.create({
    data: { aggregateType: 'test', aggregateId: id, type, payload: { id } },
  });

describe('outbox publisher (ADR-0007)', () => {
  it('delivers due events in order and marks them PUBLISHED', async () => {
    const seen: string[] = [];
    await add('t.a', '1');
    await add('t.a', '2');
    const pub = new OutboxPublisher(prisma, {
      't.a': async (e: OutboxRow) => void seen.push(e.aggregateId),
    });
    const r = await pub.runOnce();
    expect(r).toEqual({ claimed: 2, published: 2, failed: 0, dead: 0 });
    expect(seen).toEqual(['1', '2']);
    expect(await prisma.outboxEvent.count({ where: { status: 'PUBLISHED' } })).toBe(2);
    expect((await pub.runOnce()).claimed).toBe(0);
  });

  it('events without a registered handler are published without side effects', async () => {
    await add('unknown.type', '1');
    const r = await new OutboxPublisher(prisma, {}).runOnce();
    expect(r.published).toBe(1);
  });

  it('two workers never process the same event (SKIP LOCKED)', async () => {
    for (let i = 0; i < 40; i++) await add('t.b', String(i));
    const counts = new Map<string, number>();
    const handler = async (e: OutboxRow) => {
      await new Promise((r) => setTimeout(r, 5));
      counts.set(e.aggregateId, (counts.get(e.aggregateId) ?? 0) + 1);
    };
    const pubs = Array.from(
      { length: 4 },
      (_, i) =>
        new OutboxPublisher(prisma, { 't.b': handler }, { workerId: `w${i}`, batchSize: 10 }),
    );
    await Promise.all(
      pubs.map(async (p) => {
        while ((await p.runOnce()).claimed > 0) {
          /* drain */
        }
      }),
    );
    expect(counts.size).toBe(40);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(await prisma.outboxEvent.count({ where: { status: 'PUBLISHED' } })).toBe(40);
  });

  it('retries with exponential backoff, then moves to DEAD after maxAttempts', async () => {
    await add('t.fail', '1');
    let clock = new Date(Date.now() + 5000);
    const pub = new OutboxPublisher(
      prisma,
      {
        't.fail': async () => {
          throw new Error('provider down');
        },
      },
      { maxAttempts: 3, backoffBaseMs: 1000, now: () => clock },
    );
    expect((await pub.runOnce()).failed).toBe(1);
    let row = await prisma.outboxEvent.findFirstOrThrow();
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe('provider down');
    expect(row.availableAt.getTime()).toBeGreaterThanOrEqual(clock.getTime() + 1000);

    expect((await pub.runOnce()).claimed).toBe(0); // not yet due
    clock = new Date(clock.getTime() + 1500);
    expect((await pub.runOnce()).failed).toBe(1); // attempt 2 -> backoff 2 s
    clock = new Date(clock.getTime() + 2500);
    expect((await pub.runOnce()).dead).toBe(1); // attempt 3 -> DEAD
    row = await prisma.outboxEvent.findFirstOrThrow();
    expect(row.status).toBe('DEAD');
    expect(row.attempts).toBe(3);
  });

  it('a handler is not re-run when the status update was lost after a crash (idempotent consumer)', async () => {
    const e = await add('t.idem', '1');
    await prisma.processedEvent.create({ data: { handler: 't.idem', eventId: e.id } }); // handler already ran
    let runs = 0;
    const r = await new OutboxPublisher(prisma, { 't.idem': async () => void runs++ }).runOnce();
    expect(runs).toBe(0);
    expect(r.published).toBe(1);
  });

  it('a failing handler releases its processed marker so the retry can run it', async () => {
    const e = await add('t.retry', '1');
    let calls = 0;
    const clock = new Date(Date.now() + 5000);
    const pub = new OutboxPublisher(
      prisma,
      {
        't.retry': async () => {
          if (++calls === 1) throw new Error('flaky');
        },
      },
      { backoffBaseMs: 0, now: () => new Date(clock.getTime() + calls * 10_000) },
    );
    await pub.runOnce();
    expect(await prisma.processedEvent.count({ where: { eventId: e.id } })).toBe(0);
    await pub.runOnce();
    expect(calls).toBe(2);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: e.id } })).status).toBe(
      'PUBLISHED',
    );
  });
});
