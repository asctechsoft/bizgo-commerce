import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bizgo/db';
import { PrismaService } from './prisma.service';

export interface OutboxInput {
  aggregateType: string;
  aggregateId: string;
  type: string;
  payload: Prisma.InputJsonValue;
  /** Natural key to make enqueue idempotent (e.g. `order.created:<orderId>`). */
  dedupeKey?: string;
  availableAt?: Date;
}

/**
 * Transactional outbox (ADR-0007). Always enqueue with the SAME transaction client that performs
 * the state change, so the event exists if and only if the change committed.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: OutboxInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    if (input.dedupeKey) {
      await client.outboxEvent.upsert({
        where: { dedupeKey: input.dedupeKey },
        update: {},
        create: this.toCreate(input),
      });
      return;
    }
    await client.outboxEvent.create({ data: this.toCreate(input) });
  }

  private toCreate(input: OutboxInput): Prisma.OutboxEventCreateInput {
    return {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      type: input.type,
      payload: input.payload,
      dedupeKey: input.dedupeKey ?? null,
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
    };
  }
}
