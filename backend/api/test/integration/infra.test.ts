import { AppError } from '@bizgo/shared';
import { AuditService } from '../../src/infra/audit.service';
import { IdempotencyService } from '../../src/infra/idempotency.service';
import { OutboxService } from '../../src/infra/outbox.service';
import { PrismaService } from '../../src/infra/prisma.service';
import { canonicalHash } from '../../src/common/crypto';
import { createTestApp, type TestApp } from '../helpers/app';

let t: TestApp;
let idem: IdempotencyService;
let outbox: OutboxService;
let audit: AuditService;
let prisma: PrismaService;

beforeAll(async () => {
  t = await createTestApp();
  idem = t.app.get(IdempotencyService);
  outbox = t.app.get(OutboxService);
  audit = t.app.get(AuditService);
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.close();
});

const KEY = (n: string) => `key-${n}-`.padEnd(24, '0');

describe('idempotency (ADR-0006, UAT-03 foundation)', () => {
  it('executes once and replays the stored response for the same key and body', async () => {
    let runs = 0;
    const params = {
      actorScope: 'u1',
      scope: 'orders.create',
      key: KEY('a'),
      requestHash: canonicalHash({ q: 1 }),
    };
    const work = async (tx: typeof prisma) => {
      runs++;
      await tx.setting.create({ data: { key: `idem.test.${runs}`, value: { n: runs } } });
      return { status: 201, body: { id: `order-${runs}` } };
    };
    const first = await idem.execute(params, work as never);
    const second = await idem.execute(params, work as never);
    expect(runs).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second).toEqual({ status: 201, body: { id: 'order-1' }, replayed: true });
    expect(await prisma.setting.count({ where: { key: { startsWith: 'idem.test.' } } })).toBe(1);
  });

  it('rejects the same key with a different request body', async () => {
    const base = { actorScope: 'u1', scope: 'orders.create', key: KEY('b') };
    await idem.execute({ ...base, requestHash: canonicalHash({ q: 1 }) }, async () => ({
      status: 201,
      body: {},
    }));
    await expect(
      idem.execute({ ...base, requestHash: canonicalHash({ q: 2 }) }, async () => ({
        status: 201,
        body: {},
      })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('is scoped per actor and per operation', async () => {
    let runs = 0;
    const work = async () => ({ status: 200, body: { n: ++runs } });
    const hash = canonicalHash({});
    await idem.execute({ actorScope: 'u1', scope: 's', key: KEY('c'), requestHash: hash }, work);
    await idem.execute({ actorScope: 'u2', scope: 's', key: KEY('c'), requestHash: hash }, work);
    await idem.execute({ actorScope: 'u1', scope: 's2', key: KEY('c'), requestHash: hash }, work);
    expect(runs).toBe(3);
  });

  it('parallel retries with one key run the business logic exactly once (double-click)', async () => {
    let runs = 0;
    const params = {
      actorScope: 'u9',
      scope: 'orders.create',
      key: KEY('race'),
      requestHash: canonicalHash({ x: 1 }),
    };
    const work = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 150));
      return { status: 201, body: { ok: true } };
    };
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => idem.execute(params, work)),
    );
    expect(runs).toBe(1);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) expect((r.reason as AppError).code).toBe('IDEMPOTENCY_IN_PROGRESS');
    const after = await idem.execute(params, work);
    expect(after.replayed).toBe(true);
    expect(runs).toBe(1);
  });

  it('a failed business call rolls back its writes and releases the key for a retry', async () => {
    const params = {
      actorScope: 'u3',
      scope: 'orders.create',
      key: KEY('fail'),
      requestHash: canonicalHash({}),
    };
    await expect(
      idem.execute(params, async (tx) => {
        await tx.setting.create({ data: { key: 'idem.fail.marker', value: true } });
        throw new AppError('OUT_OF_STOCK', 'Hết hàng');
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
    expect(await prisma.setting.count({ where: { key: 'idem.fail.marker' } })).toBe(0);
    const retry = await idem.execute(params, async () => ({ status: 201, body: { ok: 1 } }));
    expect(retry.replayed).toBe(false);
  });

  it('validates key length', async () => {
    await expect(
      idem.execute({ actorScope: 'u', scope: 's', key: 'short', requestHash: 'h' }, async () => ({
        status: 200,
        body: {},
      })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('transactional outbox + audit (ADR-0007)', () => {
  it('event and audit row exist iff the surrounding transaction commits', async () => {
    const before = { o: await prisma.outboxEvent.count(), a: await prisma.auditLog.count() };
    await expect(
      prisma.$transaction(async (tx) => {
        await outbox.enqueue(
          { aggregateType: 'test', aggregateId: '1', type: 'test.rolled_back', payload: {} },
          tx,
        );
        await audit.record({ action: 'test.rolled_back', entityType: 'test', entityId: '1' }, tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.outboxEvent.count()).toBe(before.o);
    expect(await prisma.auditLog.count()).toBe(before.a);

    await prisma.$transaction(async (tx) => {
      await outbox.enqueue(
        { aggregateType: 'test', aggregateId: '2', type: 'test.committed', payload: { a: 1 } },
        tx,
      );
      await audit.record(
        {
          action: 'test.committed',
          entityType: 'test',
          entityId: '2',
          after: { password: 'x', ok: 1 },
        },
        tx,
      );
    });
    expect(await prisma.outboxEvent.count()).toBe(before.o + 1);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: 'test.committed' } });
    expect(row.after).toEqual({ password: '[REDACTED]', ok: 1 });
  });

  it('dedupeKey makes enqueue idempotent', async () => {
    const input = {
      aggregateType: 'order',
      aggregateId: 'o1',
      type: 'order.created',
      payload: {},
      dedupeKey: 'order.created:o1',
    };
    await outbox.enqueue(input);
    await outbox.enqueue(input);
    expect(await prisma.outboxEvent.count({ where: { dedupeKey: 'order.created:o1' } })).toBe(1);
  });

  it('new events start PENDING and available immediately', async () => {
    const e = await prisma.outboxEvent.findFirstOrThrow({ where: { type: 'test.committed' } });
    expect(e.status).toBe('PENDING');
    expect(e.attempts).toBe(0);
    expect(e.availableAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
