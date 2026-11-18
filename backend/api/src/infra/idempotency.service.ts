import { Injectable } from '@nestjs/common';
import { Prisma } from '@bizgo/db';
import { AppError } from '@bizgo/shared';
import { PrismaService } from './prisma.service';
import { Clock } from '../common/clock';

export interface IdempotentResult<T> {
  status: number;
  body: T;
  /** true when the stored response of an earlier identical request was returned. */
  replayed: boolean;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_MS = 30 * 1000;

/**
 * Idempotency for money/order mutations (ADR-0006).
 * `actorScope` = who (user id or guest token hash), `scope` = operation name, `key` = client header.
 * The business function runs inside the same transaction as the idempotency row's final write, so a
 * crash cannot leave a stored success without the business effect (or the reverse).
 */
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async execute<T>(
    params: { actorScope: string; scope: string; key: string; requestHash: string },
    work: (tx: Prisma.TransactionClient) => Promise<{ status: number; body: T }>,
  ): Promise<IdempotentResult<T>> {
    const { actorScope, scope, key, requestHash } = params;
    if (key.length < 16 || key.length > 128) {
      throw new AppError('VALIDATION_ERROR', 'Idempotency-Key phải dài từ 16 đến 128 ký tự.');
    }
    const now = this.clock.now();

    // Claim the key. Unique (actorScope, scope, key) makes concurrent first-writers race safely.
    let claimed = false;
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          actorScope,
          scope,
          key,
          requestHash,
          lockedUntil: new Date(now.getTime() + LOCK_MS),
          expiresAt: new Date(now.getTime() + TTL_MS),
        },
      });
      claimed = true;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }

    if (!claimed) {
      const existing = await this.prisma.idempotencyKey.findUniqueOrThrow({
        where: { actorScope_scope_key: { actorScope, scope, key } },
      });
      if (existing.requestHash !== requestHash) {
        throw new AppError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency-Key này đã được dùng cho một yêu cầu khác.',
        );
      }
      if (existing.responseStatus !== null) {
        return {
          status: existing.responseStatus,
          body: existing.responseBody as T,
          replayed: true,
        };
      }
      if (existing.lockedUntil && existing.lockedUntil > now) {
        throw new AppError(
          'IDEMPOTENCY_IN_PROGRESS',
          'Yêu cầu đang được xử lý. Vui lòng chờ giây lát.',
        );
      }
      // Stale lock from a crashed attempt: take it over and re-run.
      await this.prisma.idempotencyKey.update({
        where: { actorScope_scope_key: { actorScope, scope, key } },
        data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const result = await work(tx);
        await tx.idempotencyKey.update({
          where: { actorScope_scope_key: { actorScope, scope, key } },
          data: {
            responseStatus: result.status,
            responseBody: result.body as unknown as Prisma.InputJsonValue,
            lockedUntil: null,
          },
        });
        return { ...result, replayed: false };
      });
    } catch (e) {
      // Business failure: release the claim so the client can retry with the same key.
      await this.prisma.idempotencyKey
        .deleteMany({ where: { actorScope, scope, key, responseStatus: null } })
        .catch(() => undefined);
      throw e;
    }
  }
}
