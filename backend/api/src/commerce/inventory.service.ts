import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bizgo/db';
import { AppError } from '@bizgo/shared';
import { PrismaService } from '../infra/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface BestStock {
  warehouseId: string;
  available: bigint;
}

/**
 * Inventory (ADR-0004). available = on_hand - reserved - quarantined. Reservation is a SINGLE conditional
 * UPDATE (the statement is the lock; no read-then-write), so concurrent buyers cannot oversell.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Best warehouse per variant (one warehouse per order line in the MVP). */
  async bestStock(db: Db, variantIds: string[]): Promise<Map<string, BestStock>> {
    const rows = await db.inventoryBalance.findMany({ where: { variantId: { in: variantIds } } });
    const best = new Map<string, BestStock>();
    for (const r of rows) {
      const available = r.onHand - r.reserved - r.quarantined;
      const cur = best.get(r.variantId);
      if (!cur || available > cur.available)
        best.set(r.variantId, { warehouseId: r.warehouseId, available });
    }
    return best;
  }

  /**
   * Hold `qty` for an order line. Tries warehouses by descending availability. Must be called inside the
   * order transaction, lines in deterministic (variantId ASC) order to avoid deadlocks.
   */
  async reserve(
    tx: Prisma.TransactionClient,
    p: {
      orderId: string;
      orderItemId: string;
      variantId: string;
      qty: number;
      actorId: string | null;
    },
  ): Promise<{ warehouseId: string }> {
    const qty = BigInt(p.qty);
    const candidates = await tx.inventoryBalance.findMany({ where: { variantId: p.variantId } });
    candidates.sort((a, b) => {
      const av = a.onHand - a.reserved - a.quarantined;
      const bv = b.onHand - b.reserved - b.quarantined;
      return av === bv ? a.warehouseId.localeCompare(b.warehouseId) : av > bv ? -1 : 1;
    });
    for (const c of candidates) {
      const updated = await tx.$executeRaw`
        UPDATE "inventory_balances"
           SET "reserved" = "reserved" + ${qty}, "version" = "version" + 1, "updated_at" = now()
         WHERE "warehouse_id" = ${c.warehouseId}::uuid AND "variant_id" = ${p.variantId}::uuid
           AND "on_hand" - "reserved" - "quarantined" >= ${qty}`;
      if (updated === 1) {
        await tx.inventoryReservation.create({
          data: {
            orderId: p.orderId,
            orderItemId: p.orderItemId,
            warehouseId: c.warehouseId,
            variantId: p.variantId,
            qty,
            status: 'HELD',
          },
        });
        await tx.stockMovement.create({
          data: {
            warehouseId: c.warehouseId,
            variantId: p.variantId,
            type: 'RESERVE',
            qty,
            reasonCode: 'ORDER_CREATED',
            actorId: p.actorId,
            refType: 'order',
            refId: p.orderId,
          },
        });
        return { warehouseId: c.warehouseId };
      }
    }
    throw new AppError('OUT_OF_STOCK', 'Sản phẩm không đủ hàng để giữ cho đơn này.', [
      { variantId: p.variantId },
    ]);
  }

  /**
   * Release every HELD reservation of an order exactly once. The `status = 'HELD'` guard (and the terminal
   * trigger) make a second call, or a race with dispatch, a no-op.
   */
  async releaseOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    reason: string,
    actorId: string | null,
  ): Promise<number> {
    const held = await tx.inventoryReservation.findMany({ where: { orderId, status: 'HELD' } });
    let released = 0;
    for (const r of held) {
      const claimed = await tx.inventoryReservation.updateMany({
        where: { id: r.id, status: 'HELD' },
        data: { status: 'RELEASED' },
      });
      if (claimed.count !== 1) continue;
      const n = await tx.$executeRaw`
        UPDATE "inventory_balances"
           SET "reserved" = "reserved" - ${r.qty}, "version" = "version" + 1, "updated_at" = now()
         WHERE "warehouse_id" = ${r.warehouseId}::uuid AND "variant_id" = ${r.variantId}::uuid
           AND "reserved" >= ${r.qty}`;
      if (n !== 1)
        throw new AppError('INSUFFICIENT_STOCK', 'Sổ tồn kho không khớp khi nhả hàng giữ.');
      await tx.stockMovement.create({
        data: {
          warehouseId: r.warehouseId,
          variantId: r.variantId,
          type: 'RELEASE',
          qty: r.qty,
          reasonCode: reason,
          actorId,
          refType: 'order',
          refId: orderId,
        },
      });
      released++;
    }
    return released;
  }

  /** Manual stock adjustment (ledger entry + balance change in one transaction). */
  async adjust(p: {
    warehouseId: string;
    variantId: string;
    delta: number;
    reasonCode: string;
    actorId: string;
  }): Promise<{ onHand: bigint; reserved: bigint; available: bigint }> {
    if (!Number.isInteger(p.delta) || p.delta === 0) {
      throw new AppError('VALIDATION_ERROR', 'Mức điều chỉnh phải là số nguyên khác 0.');
    }
    const delta = BigInt(p.delta);
    return this.prisma.$transaction(async (tx) => {
      await tx.inventoryBalance.upsert({
        where: { warehouseId_variantId: { warehouseId: p.warehouseId, variantId: p.variantId } },
        update: {},
        create: { warehouseId: p.warehouseId, variantId: p.variantId },
      });
      const n = await tx.$executeRaw`
        UPDATE "inventory_balances"
           SET "on_hand" = "on_hand" + ${delta}, "version" = "version" + 1, "updated_at" = now()
         WHERE "warehouse_id" = ${p.warehouseId}::uuid AND "variant_id" = ${p.variantId}::uuid
           AND "on_hand" + ${delta} >= "reserved" + "quarantined"`;
      if (n !== 1) {
        throw new AppError('INSUFFICIENT_STOCK', 'Không thể giảm tồn dưới mức đang giữ/khóa.');
      }
      await tx.stockMovement.create({
        data: {
          warehouseId: p.warehouseId,
          variantId: p.variantId,
          type: delta > 0n ? 'ADJUST_PLUS' : 'ADJUST_MINUS',
          qty: delta > 0n ? delta : -delta,
          reasonCode: p.reasonCode,
          actorId: p.actorId,
          refType: 'adjustment',
        },
      });
      const b = await tx.inventoryBalance.findUniqueOrThrow({
        where: { warehouseId_variantId: { warehouseId: p.warehouseId, variantId: p.variantId } },
      });
      return {
        onHand: b.onHand,
        reserved: b.reserved,
        available: b.onHand - b.reserved - b.quarantined,
      };
    });
  }
}
