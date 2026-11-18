import { Injectable } from '@nestjs/common';
import { Prisma } from '@bizgo/db';
import { AppError, vndToJson } from '@bizgo/shared';
import { Clock } from '../common/clock';
import { AuditService } from '../infra/audit.service';
import { OutboxService } from '../infra/outbox.service';
import { PrismaService } from '../infra/prisma.service';
import { evaluateSkuGate, type GateItem } from './sku-gate';

export interface VariantInput {
  productId: string;
  sku: string;
  packLabel: string;
  sellableUnit: string;
  netWeightG?: number | undefined;
  piecesPerPack?: number | undefined;
  storageClass?: 'DRY' | 'AMBIENT' | 'CHILLED' | 'FROZEN' | 'FRAGILE' | undefined;
  minQty?: number | undefined;
  maxQty?: number | undefined;
  quantityStep?: number | undefined;
  manufacturer?: string | undefined;
  responsibleEntity?: string | undefined;
  shelfLifeDays?: number | undefined;
}

export interface AdminVariantDto {
  id: string;
  productId: string;
  sku: string;
  packLabel: string;
  sellableUnit: string;
  netWeightG: number | null;
  storageClass: string | null;
  minQty: number;
  maxQty: number | null;
  quantityStep: number;
  status: string;
  isTest: boolean;
}

function toDto(v: Prisma.ProductVariantGetPayload<object>): AdminVariantDto {
  return {
    id: v.id,
    productId: v.productId,
    sku: v.sku,
    packLabel: v.packLabel,
    sellableUnit: v.sellableUnit,
    netWeightG: v.netWeightG,
    storageClass: v.storageClass,
    minQty: v.minQty,
    maxQty: v.maxQty,
    quantityStep: v.quantityStep,
    status: v.status,
    isTest: v.isTest,
  };
}

@Injectable()
export class VariantsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
  ) {}

  async create(actorId: string, input: VariantInput, requestId: string): Promise<AdminVariantDto> {
    const product = await this.prisma.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new AppError('NOT_FOUND', 'Không tìm thấy sản phẩm.');
    const exists = await this.prisma.productVariant.findUnique({ where: { sku: input.sku } });
    if (exists) throw new AppError('VALIDATION_ERROR', 'SKU đã tồn tại.');
    const v = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productVariant.create({
        data: {
          productId: input.productId,
          sku: input.sku,
          packLabel: input.packLabel,
          sellableUnit: input.sellableUnit,
          netWeightG: input.netWeightG ?? null,
          piecesPerPack: input.piecesPerPack ?? null,
          storageClass: input.storageClass ?? null,
          minQty: input.minQty ?? 1,
          maxQty: input.maxQty ?? null,
          quantityStep: input.quantityStep ?? 1,
          manufacturer: input.manufacturer ?? null,
          responsibleEntity: input.responsibleEntity ?? null,
          shelfLifeDays: input.shelfLifeDays ?? null,
          status: 'DRAFT', // never created ACTIVE: activation goes through the gate
          isTest: false,
        },
      });
      await this.audit.record(
        {
          actorId,
          action: 'variant.created',
          entityType: 'variant',
          entityId: created.id,
          after: { sku: created.sku },
          requestId,
        },
        tx,
      );
      return created;
    });
    return toDto(v);
  }

  async list(productId: string): Promise<AdminVariantDto[]> {
    const rows = await this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async readiness(variantId: string): Promise<{ ready: boolean; items: GateItem[] }> {
    const now = this.clock.now();
    const v = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: { include: { media: true } },
        costs: {
          where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
        },
        priceRules: {
          where: {
            channel: 'RETAIL',
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
        },
        balances: true,
      },
    });
    if (!v) throw new AppError('NOT_FOUND', 'Không tìm thấy biến thể SKU.');
    return evaluateSkuGate({
      isTest: v.isTest,
      packLabel: v.packLabel,
      netWeightG: v.netWeightG,
      storageClass: v.storageClass,
      manufacturer: v.manufacturer,
      responsibleEntity: v.responsibleEntity,
      hasCurrentCost: v.costs.length > 0,
      hasCurrentRetailPrice: v.priceRules.length > 0,
      hasStockRow: v.balances.length > 0,
      hasVerifiedMedia: v.product.media.some((m) => !m.isIllustrative && m.verifiedAt !== null),
      originVerified: v.product.originType !== 'UNVERIFIED',
    });
  }

  /** Publish through the readiness gate. A product only becomes ACTIVE together with a verified ACTIVE SKU. */
  async publish(actorId: string, variantId: string, requestId: string): Promise<AdminVariantDto> {
    const gate = await this.readiness(variantId);
    if (!gate.ready) {
      throw new AppError(
        'SKU_NOT_READY',
        'SKU chưa đủ điều kiện mở bán.',
        gate.items.filter((i) => !i.ok).map((i) => ({ item: i.item, message: i.message })),
      );
    }
    const v = await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: { status: 'ACTIVE' },
      });
      await tx.product.update({ where: { id: variant.productId }, data: { status: 'ACTIVE' } });
      await this.audit.record(
        {
          actorId,
          action: 'variant.published',
          entityType: 'variant',
          entityId: variantId,
          after: { status: 'ACTIVE' },
          requestId,
        },
        tx,
      );
      await this.outbox.enqueue(
        {
          aggregateType: 'variant',
          aggregateId: variantId,
          type: 'variant.published',
          payload: { variantId },
          dedupeKey: `variant.published:${variantId}`,
        },
        tx,
      );
      return variant;
    });
    return toDto(v);
  }

  async setPrice(
    actorId: string,
    p: {
      variantId: string;
      unitPriceVnd: number;
      minQty?: number | undefined;
      validFrom?: Date | undefined;
      validTo?: Date | undefined;
    },
    requestId: string,
  ) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: p.variantId } });
    if (!variant) throw new AppError('NOT_FOUND', 'Không tìm thấy biến thể SKU.');
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const r = await tx.priceRule.create({
          data: {
            variantId: p.variantId,
            channel: 'RETAIL',
            minQty: p.minQty ?? 1,
            unitPriceVnd: BigInt(p.unitPriceVnd),
            validFrom: p.validFrom ?? this.clock.now(),
            validTo: p.validTo ?? null,
            createdBy: actorId,
          },
        });
        await this.audit.record(
          {
            actorId,
            action: 'price.set',
            entityType: 'variant',
            entityId: p.variantId,
            after: {
              unitPriceVnd: p.unitPriceVnd,
              minQty: r.minQty,
              validFrom: r.validFrom,
              validTo: r.validTo,
            },
            requestId,
          },
          tx,
        );
        return r;
      });
      return {
        id: row.id,
        variantId: row.variantId,
        unitPriceVnd: vndToJson(row.unitPriceVnd),
        minQty: row.minQty,
        validFrom: row.validFrom,
        validTo: row.validTo,
      };
    } catch (e) {
      if (String((e as Error).message).includes('price_rules_no_overlap_ex')) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Khoảng hiệu lực giá bị chồng lấn với một mức giá đang có.',
        );
      }
      throw e;
    }
  }

  async setCost(
    actorId: string,
    p: {
      variantId: string;
      costVnd: number;
      validFrom?: Date | undefined;
      validTo?: Date | undefined;
    },
    requestId: string,
  ) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: p.variantId } });
    if (!variant) throw new AppError('NOT_FOUND', 'Không tìm thấy biến thể SKU.');
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.supplierCost.create({
        data: {
          variantId: p.variantId,
          costVnd: BigInt(p.costVnd),
          validFrom: p.validFrom ?? this.clock.now(),
          validTo: p.validTo ?? null,
          createdBy: actorId,
        },
      });
      // cost values are deliberately NOT written to the audit payload; the row id is enough to trace
      await this.audit.record(
        {
          actorId,
          action: 'cost.set',
          entityType: 'variant',
          entityId: p.variantId,
          after: { costRuleId: r.id },
          requestId,
        },
        tx,
      );
      return r;
    });
    return {
      id: row.id,
      variantId: row.variantId,
      costVnd: vndToJson(row.costVnd),
      validFrom: row.validFrom,
      validTo: row.validTo,
    };
  }

  async createWarehouse(actorId: string, p: { code: string; name: string }, requestId: string) {
    const exists = await this.prisma.warehouse.findUnique({ where: { code: p.code } });
    if (exists) throw new AppError('VALIDATION_ERROR', 'Mã kho đã tồn tại.');
    const w = await this.prisma.warehouse.create({
      data: { code: p.code, name: p.name, isTest: false },
    });
    await this.audit.record({
      actorId,
      action: 'warehouse.created',
      entityType: 'warehouse',
      entityId: w.id,
      requestId,
    });
    return { id: w.id, code: w.code, name: w.name };
  }

  async listWarehouses() {
    const rows = await this.prisma.warehouse.findMany({ orderBy: { code: 'asc' } });
    return rows.map((w) => ({ id: w.id, code: w.code, name: w.name }));
  }

  async inventory(q: { variantId?: string | undefined }) {
    const rows = await this.prisma.inventoryBalance.findMany({
      where: q.variantId ? { variantId: q.variantId } : {},
      include: { warehouse: true, variant: true },
      orderBy: [{ warehouseId: 'asc' }, { variantId: 'asc' }],
    });
    return rows.map((r) => ({
      warehouseId: r.warehouseId,
      warehouseCode: r.warehouse.code,
      variantId: r.variantId,
      sku: r.variant.sku,
      onHand: vndToJson(r.onHand), // same safe-integer guard (counts, not money)
      reserved: vndToJson(r.reserved),
      quarantined: vndToJson(r.quarantined),
      available: vndToJson(r.onHand - r.reserved - r.quarantined),
    }));
  }
}
