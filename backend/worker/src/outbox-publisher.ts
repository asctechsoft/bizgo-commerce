import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@bizgo/db';

export interface OutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
  attempts: number;
}

/** Handlers must be idempotent: delivery is at-least-once (ADR-0007). */
export type OutboxHandler = (event: OutboxRow) => Promise<void>;

export interface PublisherOptions {
  workerId?: string;
  batchSize?: number;
  maxAttempts?: number;
  /** lock duration while a batch is being processed */
  lockMs?: number;
  /** base backoff; delay = base * 2^(attempts-1), capped at 1 h */
  backoffBaseMs?: number;
  /** Test hook. In production the DATABASE clock is used so worker/DB clock skew cannot matter. */
  now?: () => Date;
}

interface ClaimedRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  type: string;
  payload: unknown;
  occurred_at: Date;
  attempts: number;
}

export class OutboxPublisher {
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly lockMs: number;
  private readonly backoffBaseMs: number;
  private readonly injectedNow: (() => Date) | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly handlers: Record<string, OutboxHandler>,
    opts: PublisherOptions = {},
  ) {
    this.workerId = opts.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
    this.batchSize = opts.batchSize ?? 20;
    this.maxAttempts = opts.maxAttempts ?? 8;
    this.lockMs = opts.lockMs ?? 60_000;
    this.backoffBaseMs = opts.backoffBaseMs ?? 5_000;
    this.injectedNow = opts.now;
  }

  private async now(): Promise<Date> {
    if (this.injectedNow) return this.injectedNow();
    const rows = await this.prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    return (rows[0] as { now: Date }).now;
  }

  /**
   * Claim up to `batchSize` due PENDING events with FOR UPDATE SKIP LOCKED (two workers never take the
   * same row), run each handler, then mark PUBLISHED, or schedule a retry / move to DEAD.
   */
  async runOnce(): Promise<{ claimed: number; published: number; failed: number; dead: number }> {
    const now = await this.now();
    const lockedUntil = new Date(now.getTime() + this.lockMs);
    const claimed = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "outbox_events" SET "locked_by" = ${this.workerId}, "locked_until" = ${lockedUntil}
      WHERE "id" IN (
        SELECT "id" FROM "outbox_events"
        WHERE "status" = 'PENDING' AND "available_at" <= ${now}
          AND ("locked_until" IS NULL OR "locked_until" < ${now})
        ORDER BY "occurred_at"
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "aggregate_type", "aggregate_id", "type", "payload", "occurred_at", "attempts"`;

    let published = 0;
    let failed = 0;
    let dead = 0;
    for (const row of claimed.sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime())) {
      const event: OutboxRow = {
        id: row.id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        type: row.type,
        payload: row.payload,
        occurredAt: row.occurred_at,
        attempts: row.attempts,
      };
      try {
        await this.dispatch(event);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'PUBLISHED', lockedBy: null, lockedUntil: null, lastError: null },
        });
        published++;
      } catch (e) {
        const attempts = event.attempts + 1;
        const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        if (attempts >= this.maxAttempts) {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'DEAD',
              attempts,
              lockedBy: null,
              lockedUntil: null,
              lastError: message,
            },
          });
          dead++;
        } else {
          const delay = Math.min(this.backoffBaseMs * 2 ** (attempts - 1), 3_600_000);
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts,
              lockedBy: null,
              lockedUntil: null,
              lastError: message,
              availableAt: new Date((await this.now()).getTime() + delay),
            },
          });
          failed++;
        }
      }
    }
    return { claimed: claimed.length, published, failed, dead };
  }

  /** Idempotent dispatch: a handler never runs twice for the same event id. */
  private async dispatch(event: OutboxRow): Promise<void> {
    const handler = this.handlers[event.type];
    if (!handler) return; // no consumer registered yet: event is considered published
    const name = event.type;
    try {
      await this.prisma.processedEvent.create({ data: { handler: name, eventId: event.id } });
    } catch {
      return; // already processed (retry after a crash between handler and status update)
    }
    try {
      await handler(event);
    } catch (e) {
      // roll back the processed marker so the retry can run the handler again
      await this.prisma.processedEvent.deleteMany({ where: { handler: name, eventId: event.id } });
      throw e;
    }
  }
}
