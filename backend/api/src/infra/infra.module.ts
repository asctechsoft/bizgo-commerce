import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { Clock, SystemClock } from '../common/clock';
import { AuditService } from './audit.service';
import { IdempotencyService } from './idempotency.service';
import { OutboxService } from './outbox.service';
import { PrismaService } from './prisma.service';
import { MemoryRateLimiter, RateLimiter, RedisRateLimiter } from './rate-limiter';

@Global()
@Module({
  providers: [
    PrismaService,
    { provide: Clock, useClass: SystemClock },
    {
      provide: RateLimiter,
      inject: [APP_CONFIG, Clock],
      useFactory: (config: AppConfig, clock: Clock) =>
        config.REDIS_URL ? new RedisRateLimiter(config) : new MemoryRateLimiter(clock),
    },
    AuditService,
    OutboxService,
    IdempotencyService,
  ],
  exports: [PrismaService, Clock, RateLimiter, AuditService, OutboxService, IdempotencyService],
})
export class InfraModule {}
