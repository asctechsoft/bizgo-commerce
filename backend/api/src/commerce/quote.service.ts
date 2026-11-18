import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bizgo/db';
import { AppError, vndToJson } from '@bizgo/shared';
import { Clock } from '../common/clock';
import { PrismaService } from '../infra/prisma.service';
import { InventoryService } from './inventory.service';
import {
  computeQuote,
  type QuoteBlocker,
  type QuoteLineInput,
  type QuoteResult,
  type StorageClassName,
} from './pricing.engine';
import { SettingsService } from './settings.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface QuoteItemInput {
  variantId: string;
  quantity: number;
}

export interface QuoteDto {
  quoteId: string;
  version: number;
  expiresAt: Date;
  currency: 'VND';
  lines: {
    variantId: string;
    sku: string;
    name: string;
    packLabel: string;
    quantity: number;
    unitPriceVnd: number | null;
    lineTotalVnd: number | null;
  }[];
  subtotalVnd: number | null;
  shippingFeeVnd: number | null;
  shippingNote: 'MANUAL_QUOTE' | null;
  totalVnd: number | null;
  canPlaceOrder: boolean;
  blockers: QuoteBlocker[];
}

export interface BuiltQuote {
  result: QuoteResult;
  items: QuoteItemInput[];
  address: { id: string; province: string } | null;
}

/** Quote = server-side, versioned, expiring snapshot. The client never supplies a price (ADR-0006/0010). */
@Injectable()
export class QuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /** Re-prices from live data. Reused by order creation (inside its transaction) to re-validate. */
  async build(
    db: Db,
    userId: string,
    input: { items?: QuoteItemInput[] | undefined; addressId?: string | null | undefined },
  ): Promise<BuiltQuote> {
    let items = input.items;
    if (!items) {
      const cart = await db.cart.findUnique({ where: { userId }, include: { items: true } });
      items = (cart?.items ?? []).map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    }
    // merge duplicate variants so a client cannot dodge per-variant limits by splitting lines
    const merged = new Map<string, number>();
    for (const i of items) merged.set(i.variantId, (merged.get(i.variantId) ?? 0) + i.quantity);
    const normalized = [...merged.entries()]
      .map(([variantId, quantity]) => ({ variantId, quantity }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId));

    const now = this.clock.now();
    const variants = await db.productVariant.findMany({
      where: { id: { in: normalized.map((i) => i.variantId) } },
      include: {
        product: true,
        priceRules: { where: { channel: 'RETAIL', validFrom: { lte: now } } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const stock = await this.inventory.bestStock(db, [...byId.keys()]);

    const lines: QuoteLineInput[] = [];
    for (const i of normalized) {
      const v = byId.get(i.variantId);
      if (!v)
        throw new AppError('NOT_FOUND', 'Không tìm thấy sản phẩm trong giỏ hàng.', [
          { variantId: i.variantId },
        ]);
      lines.push({
        variantId: v.id,
        sku: v.sku,
        name: v.product.displayName,
        packLabel: v.packLabel,
        netWeightG: v.netWeightG,
        storageClass: (v.storageClass as StorageClassName | null) ?? null,
        variantActive: v.status === 'ACTIVE',
        productActive: v.product.status === 'ACTIVE',
        isTest: v.isTest,
        minQty: v.minQty,
        maxQty: v.maxQty,
        quantityStep: v.quantityStep,
        quantity: i.quantity,
        rules: v.priceRules.map((r) => ({
          minQty: r.minQty,
          unitPriceVnd: r.unitPriceVnd,
          validFrom: r.validFrom,
          validTo: r.validTo,
          priority: r.priority,
        })),
        available: stock.get(v.id)?.available ?? 0n,
      });
    }

    let address: { id: string; province: string } | null = null;
    if (input.addressId) {
      const a = await db.address.findFirst({
        where: { id: input.addressId, userId, deletedAt: null },
      });
      if (!a) throw new AppError('NOT_FOUND', 'Không tìm thấy địa chỉ.');
      address = { id: a.id, province: a.province };
    }

    const { policy } = await this.settings.commerce(db);
    const result = computeQuote(lines, address, policy, now);
    return { result, items: normalized, address };
  }

  toDto(q: { id: string; version: number; expiresAt: Date }, r: QuoteResult): QuoteDto {
    const n = (v: bigint | null) => (v === null ? null : vndToJson(v));
    return {
      quoteId: q.id,
      version: q.version,
      expiresAt: q.expiresAt,
      currency: 'VND',
      lines: r.lines.map((l) => ({
        variantId: l.variantId,
        sku: l.sku,
        name: l.name,
        packLabel: l.packLabel,
        quantity: l.quantity,
        unitPriceVnd: n(l.unitPriceVnd),
        lineTotalVnd: n(l.lineTotalVnd),
      })),
      subtotalVnd: n(r.subtotalVnd),
      shippingFeeVnd: n(r.shippingFeeVnd),
      shippingNote: r.shippingNote,
      totalVnd: n(r.totalVnd),
      canPlaceOrder: r.canPlaceOrder,
      blockers: r.blockers,
    };
  }

  async create(
    userId: string,
    input: { items?: QuoteItemInput[] | undefined; addressId?: string | null | undefined },
    db: Db = this.prisma,
  ): Promise<QuoteDto> {
    const built = await this.build(db, userId, input);
    const { flags } = await this.settings.commerce(db);
    const expiresAt = new Date(this.clock.now().getTime() + flags.quoteTtlSeconds * 1000);
    const dto0 = this.toDto({ id: 'pending', version: 1, expiresAt }, built.result);
    const row = await db.checkoutQuote.create({
      data: {
        userId,
        addressId: built.address?.id ?? null,
        snapshot: {
          items: built.items,
          lines: dto0.lines,
          subtotalVnd: dto0.subtotalVnd,
          totalVnd: dto0.totalVnd,
        } as unknown as Prisma.InputJsonValue,
        canPlaceOrder: built.result.canPlaceOrder,
        totalVnd: built.result.totalVnd,
        expiresAt,
      },
    });
    return this.toDto({ id: row.id, version: row.version, expiresAt }, built.result);
  }
}
