import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppError } from '@bizgo/shared';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { Clock } from '../common/clock';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Fixed-window counters. Redis in staging/production (shared); in-memory for local/test. */
export abstract class RateLimiter {
  abstract hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult>;
  abstract reset(key: string): Promise<void>;

  /** Throw RATE_LIMITED when the budget is exhausted. */
  async consume(key: string, limit: number, windowSec: number): Promise<void> {
    const r = await this.hit(key, limit, windowSec);
    if (!r.allowed) {
      throw new AppError('RATE_LIMITED', 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.', [
        { retryAfterSec: r.retryAfterSec },
      ]);
    }
  }
}

@Injectable()
export class MemoryRateLimiter extends RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly clock: Clock) {
    super();
  }

  async hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const now = this.clock.now().getTime();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowSec * 1000 };
      this.buckets.set(key, b);
    }
    b.count++;
    const allowed = b.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - b.count),
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

@Injectable()
export class RedisRateLimiter extends RateLimiter implements OnModuleDestroy {
  private readonly logger = new Logger('RateLimiter');
  private readonly redis: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.redis = new Redis(config.REDIS_URL as string, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    this.redis.on('error', (e) => this.logger.error(`Redis error: ${e.message}`));
  }

  async hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const k = `rl:${key}`;
    const count = await this.redis.incr(k);
    if (count === 1) await this.redis.expire(k, windowSec);
    const ttl = await this.redis.ttl(k);
    if (ttl < 0) await this.redis.expire(k, windowSec); // repair a key that lost its TTL
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSec: Math.max(1, ttl > 0 ? ttl : windowSec),
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`rl:${key}`);
  }

  async ping(): Promise<boolean> {
    return (await this.redis.ping()) === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
