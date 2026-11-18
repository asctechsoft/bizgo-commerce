import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@bizgo/db';
import { APP_CONFIG, type AppConfig } from '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly skipConnect: boolean;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ datasources: { db: { url: config.DATABASE_URL } } });
    this.skipConnect = config.PRISMA_SKIP_CONNECT;
  }

  async onModuleInit(): Promise<void> {
    if (!this.skipConnect) await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
