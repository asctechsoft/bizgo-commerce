import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import type { QuotePolicy } from './pricing.engine';
import { Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import type { Prisma } from '@bizgo/db';

export interface CommerceFlags {
  codEnabled: boolean;
  bankTransferEnabled: boolean;
  quoteTtlSeconds: number;
}

/**
 * Business switches live in the `settings` table (audited, OWNER-editable). Every default is the SAFE value
 * (ADR-0013): checkout stays blocked until the owner answers D01/D05/D06/D14.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async load(
    db: Prisma.TransactionClient | PrismaService,
    prefixes: string[],
  ): Promise<Map<string, unknown>> {
    const rows = await db.setting.findMany({
      where: { OR: prefixes.map((p) => ({ key: { startsWith: p } })) },
    });
    return new Map(rows.map((r) => [r.key, r.value]));
  }

  async commerce(db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<{
    policy: QuotePolicy;
    flags: CommerceFlags;
  }> {
    const m = await this.load(db, ['checkout.', 'delivery.', 'flags.']);
    const str = <T extends string>(k: string, allowed: readonly T[], fallback: T): T => {
      const v = m.get(k);
      return typeof v === 'string' && (allowed as readonly string[]).includes(v)
        ? (v as T)
        : fallback;
    };
    const arr = (k: string): string[] => {
      const v = m.get(k);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    };
    const bool = (k: string): boolean => m.get(k) === true;
    const ttl = m.get('checkout.quote_ttl_seconds');
    return {
      policy: {
        appEnv: this.config.APP_ENV,
        shippingPolicy: str('checkout.shipping_policy', ['BLOCK', 'MANUAL_QUOTE'], 'BLOCK'),
        taxPolicy: str(
          'checkout.tax_policy',
          ['UNDETERMINED', 'INCLUSIVE', 'EXEMPT'],
          'UNDETERMINED',
        ),
        allowedProvinces: arr('delivery.allowed_provinces'),
        chilledProvinces: arr('delivery.chilled_provinces'),
      },
      flags: {
        codEnabled: bool('flags.cod_enabled'),
        bankTransferEnabled: bool('flags.bank_transfer_enabled'),
        quoteTtlSeconds: typeof ttl === 'number' && ttl >= 60 && ttl <= 86_400 ? ttl : 900,
      },
    };
  }
}
