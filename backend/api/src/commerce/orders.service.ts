import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { Prisma } from '@bizgo/db';
import {
  AppError,
  CANCELLABLE_BEFORE_DISPATCH,
  nextOrderStatus,
  vndToJson,
  type ErrorCode,
  type OrderAction,
  type OrderStatus,
  ERROR_CODES,
} from '@bizgo/shared';
import { Clock } from '../common/clock';
import { canonicalHash } from '../common/crypto';
import { Paginated } from '../common/http';
import { AuditService } from '../infra/audit.service';
import { IdempotencyService } from '../infra/idempotency.service';
import { OutboxService } from '../infra/outbox.service';
import { PrismaService } from '../infra/prisma.service';
import { InventoryService } from './inventory.service';
import { QuoteService } from './quote.service';
import { SettingsService } from './settings.service';

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function orderNumber(now: Date): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  let rnd = '';
  for (let i = 0; i < 6; i++) rnd += B32[randomInt(B32.length)];
  return `BG-${yy}${mm}${dd}-${rnd}`;
}

export interface Actor {
  userId: string;
  role?: string;
  ipHash?: string | null;
}

export interface CreateOrderInput {
  checkoutQuoteId: string;
  acceptedQuoteVersion: number;
  paymentMethod: 'COD' | 'BANK_TRANSFER';
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  paymentMethod: string;
  totalVnd: number;
  shippingFeeVnd: number | null;
  shippingNote: 'MANUAL_QUOTE' | null;
  isTest: boolean;
  createdAt: Date;
}

export interface OrderDetailDto extends OrderSummaryDto {
  shipAddress: unknown;
  items: {
    id: string;
    sku: string;
    name: string;
    packLabel: string;
    quantity: number;
    unitPriceVnd: number;
    lineTotalVnd: number;
  }[];
  timeline: { from: OrderStatus | null; to: OrderStatus; at: Date }[];
  contact?: unknown;
  financial?: {
    revenueNetVnd: number;
    costSnapshotVnd: number | null;
    expectedMarginVnd: number | null;
  };
}

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: true; payments: true; events: true };
}>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly quotes: QuoteService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
  ) {}

  // ───────────────────────────── create ─────────────────────────────

  async create(
    actor: Actor,
    input: CreateOrderInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<{ status: number; body: OrderSummaryDto; replayed: boolean }> {
    const res = await this.idempotency.execute(
      {
        actorScope: actor.userId,
        scope: 'orders.create',
        key: idempotencyKey,
        requestHash: canonicalHash(input),
      },
      async (tx) => ({ status: 201, body: await this.createInTx(tx, actor, input, requestId) }),
    );
    return { status: res.status, body: res.body, replayed: res.replayed };
  }

  private async createInTx(
    tx: Prisma.TransactionClient,
    actor: Actor,
    input: CreateOrderInput,
    requestId: string,
  ): Promise<OrderSummaryDto> {
    const now = this.clock.now();
    const quote = await tx.checkoutQuote.findFirst({
      where: { id: input.checkoutQuoteId, userId: actor.userId },
    });
    if (!quote) throw new AppError('NOT_FOUND', 'Không tìm thấy báo giá thanh toán.');
    if (quote.expiresAt <= now)
      throw new AppError('QUOTE_EXPIRED', 'Báo giá đã hết hạn. Vui lòng kiểm tra lại giỏ hàng.');
    if (quote.version !== input.acceptedQuoteVersion) {
      throw new AppError('PRICE_CHANGED', 'Báo giá đã thay đổi. Vui lòng xác nhận lại.');
    }
    // A quote can back exactly one order, even across different idempotency keys.
    const claimed = await tx.checkoutQuote.updateMany({
      where: { id: quote.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1)
      throw new AppError('QUOTE_EXPIRED', 'Báo giá này đã được dùng để đặt hàng.');

    const snapshot = quote.snapshot as unknown as {
      items: { variantId: string; quantity: number }[];
      lines: { variantId: string; unitPriceVnd: number | null }[];
      totalVnd: number | null;
    };

    // Re-price and re-validate EVERYTHING inside the transaction (never trust the accepted totals).
    const built = await this.quotes.build(tx, actor.userId, {
      items: snapshot.items,
      addressId: quote.addressId,
    });
    const r = built.result;
    if (!r.canPlaceOrder) {
      const first = r.blockers[0];
      const code = (ERROR_CODES as readonly string[]).includes(first?.code ?? '')
        ? (first?.code as ErrorCode)
        : 'VALIDATION_ERROR';
      throw new AppError(
        code,
        first?.message ?? 'Không thể đặt hàng.',
        r.blockers.map((b) => ({ ...b })),
      );
    }
    const changed =
      (r.totalVnd === null ? null : vndToJson(r.totalVnd)) !== snapshot.totalVnd ||
      r.lines.some(
        (l) =>
          (l.unitPriceVnd === null ? null : vndToJson(l.unitPriceVnd)) !==
          (snapshot.lines.find((s) => s.variantId === l.variantId)?.unitPriceVnd ?? null),
      );
    if (changed) {
      // The failing transaction rolls back; hand the customer a fresh quote to acknowledge (UAT-02).
      const fresh = await this.quotes.create(actor.userId, {
        items: snapshot.items,
        addressId: quote.addressId,
      });
      throw new AppError('PRICE_CHANGED', 'Giá đã thay đổi. Vui lòng xem lại và xác nhận.', [
        { newQuoteId: fresh.quoteId, newQuoteVersion: fresh.version, newTotalVnd: fresh.totalVnd },
      ]);
    }

    const { flags } = await this.settings.commerce(tx);
    if (input.paymentMethod === 'COD' && !flags.codEnabled) {
      throw new AppError('FEATURE_DISABLED', 'Phương thức thanh toán COD chưa được bật.');
    }
    if (input.paymentMethod === 'BANK_TRANSFER' && !flags.bankTransferEnabled) {
      throw new AppError('FEATURE_DISABLED', 'Phương thức chuyển khoản chưa được bật.');
    }

    const address = await tx.address.findFirstOrThrow({
      where: { id: quote.addressId as string, userId: actor.userId },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const variants = await tx.productVariant.findMany({
      where: { id: { in: r.lines.map((l) => l.variantId) } },
    });
    const vById = new Map(variants.map((v) => [v.id, v]));
    const costs = await tx.supplierCost.findMany({
      where: {
        variantId: { in: variants.map((v) => v.id) },
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    const costByVariant = new Map<string, bigint>();
    for (const c of costs)
      if (!costByVariant.has(c.variantId)) costByVariant.set(c.variantId, c.costVnd);

    const orderRow = await tx.order.create({
      data: {
        orderNumber: orderNumber(now),
        userId: actor.userId,
        channel: 'RETAIL',
        status: 'PENDING_CONFIRMATION',
        paymentMethod: input.paymentMethod,
        contactSnapshot: { name: user.displayName, phone: address.phone } as Prisma.InputJsonValue,
        shipAddressSnapshot: {
          receiverName: address.receiverName,
          phone: address.phone,
          province: address.province,
          district: address.district,
          ward: address.ward,
          detail: address.detail,
        } as Prisma.InputJsonValue,
        subtotalVnd: r.subtotalVnd as bigint,
        discountVnd: 0n,
        shippingFeeVnd: null,
        totalVnd: r.totalVnd as bigint,
        isTest: variants.some((v) => v.isTest),
        quoteId: quote.id,
      },
    });

    // Deterministic lock order (variantId ASC) prevents deadlocks between concurrent multi-item orders.
    let costTotal: bigint | null = 0n;
    for (const line of [...r.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const v = vById.get(line.variantId) as NonNullable<ReturnType<typeof vById.get>>;
      const cost = costByVariant.get(v.id) ?? null;
      costTotal =
        costTotal !== null && cost !== null ? costTotal + cost * BigInt(line.quantity) : null;
      const item = await tx.orderItem.create({
        data: {
          orderId: orderRow.id,
          variantId: v.id,
          skuSnap: v.sku,
          nameSnap: line.name,
          packLabelSnap: v.packLabel,
          netWeightGSnap: v.netWeightG,
          storageClassSnap: v.storageClass,
          qty: line.quantity,
          unitPriceVnd: line.unitPriceVnd as bigint,
          lineTotalVnd: line.lineTotalVnd as bigint,
          supplierCostVnd: cost,
        },
      });
      await this.inventory.reserve(tx, {
        orderId: orderRow.id,
        orderItemId: item.id,
        variantId: v.id,
        qty: line.quantity,
        actorId: actor.userId,
      });
    }

    await tx.payment.create({
      data: {
        orderId: orderRow.id,
        method: input.paymentMethod,
        status: 'PENDING',
        amountVnd: orderRow.totalVnd,
      },
    });
    await tx.orderFinancial.create({
      data: {
        orderId: orderRow.id,
        revenueNetVnd: orderRow.subtotalVnd,
        costSnapshotVnd: costTotal,
        expectedMarginVnd: costTotal === null ? null : orderRow.subtotalVnd - costTotal,
      },
    });
    await tx.orderStatusEvent.create({
      data: {
        orderId: orderRow.id,
        fromStatus: null,
        toStatus: 'PENDING_CONFIRMATION',
        actorId: actor.userId,
        reasonCode: 'ORDER_CREATED',
        requestId,
      },
    });
    // COD is never "paid" at creation; bank transfer awaits verification (ADR-0005).
    await this.audit.record(
      {
        actorId: actor.userId,
        actorRole: actor.role ?? 'CUSTOMER',
        action: 'order.created',
        entityType: 'order',
        entityId: orderRow.id,
        after: {
          orderNumber: orderRow.orderNumber,
          totalVnd: orderRow.totalVnd,
          isTest: orderRow.isTest,
        },
        requestId,
        ipHash: actor.ipHash ?? null,
      },
      tx,
    );
    await this.outbox.enqueue(
      {
        aggregateType: 'order',
        aggregateId: orderRow.id,
        type: 'order.created',
        payload: { orderId: orderRow.id, orderNumber: orderRow.orderNumber },
        dedupeKey: `order.created:${orderRow.id}`,
      },
      tx,
    );

    return {
      id: orderRow.id,
      orderNumber: orderRow.orderNumber,
      status: orderRow.status,
      paymentStatus: 'PENDING',
      paymentMethod: orderRow.paymentMethod,
      totalVnd: vndToJson(orderRow.totalVnd),
      shippingFeeVnd: null,
      shippingNote: 'MANUAL_QUOTE',
      isTest: orderRow.isTest,
      createdAt: orderRow.createdAt,
    };
  }

  // ───────────────────────────── transitions ─────────────────────────────

  /**
   * The ONLY way an order changes status (ADR-0005): explicit action → table lookup → conditional update
   * guarded by the current status (so two concurrent transitions yield exactly one success).
   */
  async transition(
    tx: Prisma.TransactionClient,
    p: {
      orderId: string;
      action: OrderAction;
      actor: Actor;
      reasonCode?: string;
      requestId: string;
      userScope?: string;
    },
  ): Promise<{ from: OrderStatus; to: OrderStatus }> {
    const order = await tx.order.findFirst({
      where: { id: p.orderId, ...(p.userScope ? { userId: p.userScope } : {}) },
    });
    if (!order) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.'); // also for out-of-scope ids
    const to = nextOrderStatus(order.status, p.action);
    if (!to) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'Trạng thái hiện tại không cho phép thao tác này.',
        [{ from: order.status, action: p.action }],
      );
    }
    const moved = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: to },
    });
    if (moved.count !== 1) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'Đơn hàng vừa được cập nhật bởi thao tác khác.',
      );
    }
    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: to,
        actorId: p.actor.userId,
        reasonCode: p.reasonCode ?? p.action,
        requestId: p.requestId,
      },
    });
    if (to === 'CANCELLED') {
      if (!CANCELLABLE_BEFORE_DISPATCH.includes(order.status)) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          'Đơn đã bàn giao, cần dùng quy trình đổi trả.',
        );
      }
      await this.inventory.releaseOrder(tx, order.id, 'ORDER_CANCELLED', p.actor.userId);
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
    }
    await this.audit.record(
      {
        actorId: p.actor.userId,
        actorRole: p.actor.role ?? null,
        action: `order.${p.action.toLowerCase()}`,
        entityType: 'order',
        entityId: order.id,
        before: { status: order.status },
        after: { status: to },
        reason: p.reasonCode ?? null,
        requestId: p.requestId,
        ipHash: p.actor.ipHash ?? null,
      },
      tx,
    );
    await this.outbox.enqueue(
      {
        aggregateType: 'order',
        aggregateId: order.id,
        type: `order.${to.toLowerCase()}`,
        payload: { orderId: order.id, from: order.status, to },
        dedupeKey: `order.status:${order.id}:${order.status}>${to}`,
      },
      tx,
    );
    return { from: order.status, to };
  }

  /** Customer cancellation: immediate before confirmation, a request after confirmation. */
  async cancelOwn(actor: Actor, orderId: string, idempotencyKey: string, requestId: string) {
    return this.idempotency.execute(
      {
        actorScope: actor.userId,
        scope: 'orders.cancel',
        key: idempotencyKey,
        requestHash: canonicalHash({ orderId }),
      },
      async (tx) => {
        const o = await tx.order.findFirst({ where: { id: orderId, userId: actor.userId } });
        if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
        const action: OrderAction = o.status === 'CONFIRMED' ? 'REQUEST_CANCEL' : 'CANCEL';
        const t = await this.transition(tx, {
          orderId,
          action,
          actor,
          reasonCode: 'CUSTOMER_REQUEST',
          requestId,
          userScope: actor.userId,
        });
        return { status: 200, body: { id: orderId, status: t.to } };
      },
    );
  }

  async adminAction(
    actor: Actor,
    orderId: string,
    action: 'CONFIRM' | 'HOLD' | 'RESUME' | 'CANCEL',
    reason: string | undefined,
    idempotencyKey: string,
    requestId: string,
  ) {
    return this.idempotency.execute(
      {
        actorScope: actor.userId,
        scope: `admin.orders.${action.toLowerCase()}`,
        key: idempotencyKey,
        requestHash: canonicalHash({ orderId, reason: reason ?? null }),
      },
      async (tx) => {
        const o = await tx.order.findUnique({ where: { id: orderId } });
        if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
        const act: OrderAction =
          action === 'CANCEL' && o.status === 'CANCEL_REQUESTED' ? 'APPROVE_CANCEL' : action;
        const t = await this.transition(tx, {
          orderId,
          action: act,
          actor,
          requestId,
          ...(reason ? { reasonCode: reason } : {}),
        });
        return { status: 200, body: { id: orderId, status: t.to } };
      },
    );
  }

  // ───────────────────────────── reads (explicit DTOs, no cost/margin) ─────────────────────────────

  private summary(
    o: OrderWithRelations | Prisma.OrderGetPayload<{ include: { payments: true } }>,
  ): OrderSummaryDto {
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.payments[0]?.status ?? 'PENDING',
      paymentMethod: o.paymentMethod,
      totalVnd: vndToJson(o.totalVnd),
      shippingFeeVnd: o.shippingFeeVnd === null ? null : vndToJson(o.shippingFeeVnd),
      shippingNote: o.shippingFeeVnd === null ? 'MANUAL_QUOTE' : null,
      isTest: o.isTest,
      createdAt: o.createdAt,
    };
  }

  async listOwn(
    userId: string,
    q: { status?: string; page: number; limit: number },
  ): Promise<Paginated<OrderSummaryDto>> {
    const where: Prisma.OrderWhereInput = {
      userId,
      ...(q.status ? { status: q.status as OrderStatus } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { payments: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    return new Paginated(
      rows.map((o) => this.summary(o)),
      q.page,
      q.limit,
      total,
    );
  }

  async getOwn(userId: string, id: string): Promise<OrderDetailDto> {
    const o = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { items: true, payments: true, events: { orderBy: { occurredAt: 'asc' } } },
    });
    if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.'); // out-of-scope ids look identical to missing ones
    return this.detail(o, false);
  }

  /** `internal` adds buyer contact (PII-gated by the caller) — never costs or margins. */
  detail(o: OrderWithRelations, internal: boolean): OrderDetailDto {
    return {
      ...this.summary(o),
      shipAddress: o.shipAddressSnapshot,
      items: o.items.map((i) => ({
        id: i.id,
        sku: i.skuSnap,
        name: i.nameSnap,
        packLabel: i.packLabelSnap,
        quantity: i.qty,
        unitPriceVnd: vndToJson(i.unitPriceVnd),
        lineTotalVnd: vndToJson(i.lineTotalVnd),
      })),
      timeline: o.events.map((e) => ({ from: e.fromStatus, to: e.toStatus, at: e.occurredAt })),
      ...(internal ? { contact: o.contactSnapshot } : {}),
    };
  }

  async adminList(q: {
    status?: string;
    page: number;
    limit: number;
  }): Promise<Paginated<OrderSummaryDto & { userId: string }>> {
    const where: Prisma.OrderWhereInput = q.status ? { status: q.status as OrderStatus } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { payments: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    return new Paginated(
      rows.map((o) => ({ ...this.summary(o), userId: o.userId })),
      q.page,
      q.limit,
      total,
    );
  }

  async adminGet(id: string, opts: { pii: boolean; margin: boolean }): Promise<OrderDetailDto> {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        events: { orderBy: { occurredAt: 'asc' } },
        financial: true,
      },
    });
    if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
    const base = this.detail(o, true);
    if (!opts.pii) {
      const phone = (o.contactSnapshot as { phone?: string }).phone ?? '';
      base.contact = {
        name: (o.contactSnapshot as { name?: string }).name,
        phone: phone ? `${phone.slice(0, 3)}****${phone.slice(-3)}` : null,
      };
      const a = o.shipAddressSnapshot as { province?: string };
      base.shipAddress = { province: a.province }; // masked: full address needs pii:read
    }
    return {
      ...base,
      ...(opts.margin && o.financial
        ? {
            financial: {
              revenueNetVnd: vndToJson(o.financial.revenueNetVnd),
              costSnapshotVnd:
                o.financial.costSnapshotVnd === null
                  ? null
                  : vndToJson(o.financial.costSnapshotVnd),
              expectedMarginVnd:
                o.financial.expectedMarginVnd === null
                  ? null
                  : vndToJson(o.financial.expectedMarginVnd),
            },
          }
        : {}),
    };
  }
}
