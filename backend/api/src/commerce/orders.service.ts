import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { Prisma } from '@bizgo/db';
import {
  AppError,
  CANCELLABLE_BEFORE_DISPATCH,
  ORDER_GROUPS,
  ORDER_GROUP_STATUSES,
  PUBLIC_CANCEL_REASONS,
  orderGroupOf,
  type OrderGroup,
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
import { CartService } from './cart.service';
import { InventoryService } from './inventory.service';
import { OrderEventsService } from './order-events.service';
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

export interface OrderListItemDto extends OrderSummaryDto {
  group: OrderGroup;
  itemCount: number;
  preview: { name: string; packLabel: string; quantity: number; imageUrl: string | null }[];
  moreItems: number;
}

export type AdminOrderAction =
  | 'CONFIRM'
  | 'HOLD'
  | 'RESUME'
  | 'CANCEL'
  | 'REJECT_CANCEL'
  | 'START_PACKING'
  | 'MARK_READY'
  | 'SHIP'
  | 'DELIVER'
  | 'COMPLETE';

export interface OrderDetailDto extends OrderSummaryDto {
  group: OrderGroup;
  shipAddress: unknown;
  subtotalVnd: number;
  discountVnd: number;
  items: {
    id: string;
    sku: string;
    name: string;
    packLabel: string;
    quantity: number;
    unitPriceVnd: number;
    lineTotalVnd: number;
    imageUrl: string | null;
  }[];
  payment: { method: string; status: string; updatedAt: Date };
  shipment: {
    carrier: string;
    trackingCode: string;
    shippedAt: Date;
    deliveredAt: Date | null;
  } | null;
  cancel: {
    status: 'CANCELLED' | 'CANCEL_REQUESTED';
    by: 'CUSTOMER' | 'STAFF' | 'SYSTEM';
    reasonCode: string | null;
    at: Date;
  } | null;
  timeline: {
    from: OrderStatus | null;
    to: OrderStatus;
    at: Date;
    by: 'CUSTOMER' | 'STAFF' | 'SYSTEM';
    reasonCode: string | null;
  }[];
  actions: { cancel: 'CANCEL' | 'REQUEST_CANCEL' | null; reorder: boolean; support: boolean };
  contact?: unknown;
  financial?: {
    revenueNetVnd: number;
    costSnapshotVnd: number | null;
    expectedMarginVnd: number | null;
  };
}

type OrderWithRelations = Prisma.OrderGetPayload<{ include: { payments: true } }>;

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
    private readonly live: OrderEventsService,
    private readonly cart: CartService,
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
    if (!res.replayed)
      this.live.emit({
        kind: 'order',
        orderId: res.body.id,
        userId: actor.userId,
        status: res.body.status,
      });
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
      shipment?: { carrier: string; trackingCode: string };
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
    if (p.action === 'SHIP') {
      const sh = p.shipment;
      if (!sh || !sh.carrier.trim() || !sh.trackingCode.trim())
        throw new AppError('VALIDATION_ERROR', 'Cần nhập đơn vị vận chuyển và mã vận đơn.');
      await tx.shipment.create({
        data: {
          orderId: order.id,
          carrier: sh.carrier.trim(),
          trackingCode: sh.trackingCode.trim(),
          shippedAt: this.clock.now(),
          createdBy: p.actor.userId,
        },
      });
      await this.inventory.consumeOrder(tx, order.id, p.actor.userId);
    }
    if (p.action === 'DELIVER') {
      await tx.shipment.updateMany({
        where: { orderId: order.id, deliveredAt: null },
        data: { deliveredAt: this.clock.now() },
      });
    }
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

  // ───────────────────────────── customer cancellation ─────────────────────────────

  /**
   * Customer cancellation: immediate while PENDING_CONFIRMATION / ON_HOLD, a *request* once CONFIRMED.
   * After that (packing, shipped…) the customer cannot cancel; they open a support request instead.
   */
  async cancelOwn(
    actor: Actor,
    orderId: string,
    idempotencyKey: string,
    requestId: string,
    reason?: string,
  ) {
    const reasonCode = reason ?? 'CUSTOMER_REQUEST';
    const res = await this.idempotency.execute(
      {
        actorScope: actor.userId,
        scope: 'orders.cancel',
        key: idempotencyKey,
        requestHash: canonicalHash({ orderId, reasonCode }),
      },
      async (tx) => {
        const o = await tx.order.findFirst({ where: { id: orderId, userId: actor.userId } });
        if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
        let action: OrderAction;
        if (o.status === 'CONFIRMED') action = 'REQUEST_CANCEL';
        else if (o.status === 'PENDING_CONFIRMATION' || o.status === 'ON_HOLD') action = 'CANCEL';
        else
          throw new AppError(
            'INVALID_STATE_TRANSITION',
            'Đơn hàng đã được xử lý nên không thể tự hủy. Vui lòng liên hệ hỗ trợ.',
            [{ from: o.status }],
          );
        const t = await this.transition(tx, {
          orderId,
          action,
          actor,
          reasonCode,
          requestId,
          userScope: actor.userId,
        });
        return { status: 200, body: { id: orderId, status: t.to } };
      },
    );
    if (!res.replayed)
      this.live.emit({ kind: 'order', orderId, userId: actor.userId, status: res.body.status });
    return res;
  }

  // ───────────────────────────── staff actions ─────────────────────────────

  async adminAction(
    actor: Actor,
    orderId: string,
    action: AdminOrderAction,
    reason: string | undefined,
    idempotencyKey: string,
    requestId: string,
    shipment?: { carrier: string; trackingCode: string },
  ) {
    const res = await this.idempotency.execute(
      {
        actorScope: actor.userId,
        scope: `admin.orders.${action.toLowerCase()}`,
        key: idempotencyKey,
        requestHash: canonicalHash({ orderId, reason: reason ?? null, shipment: shipment ?? null }),
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
          ...(shipment ? { shipment } : {}),
        });
        return { status: 200, body: { id: orderId, status: t.to } };
      },
    );
    if (!res.replayed) {
      const owner = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { userId: true },
      });
      if (owner)
        this.live.emit({ kind: 'order', orderId, userId: owner.userId, status: res.body.status });
    }
    return res;
  }

  /** Staff sets the shipping fee (manual-quote policy) while the order is not yet being packed. */
  async setShippingFee(actor: Actor, orderId: string, feeVnd: number, requestId: string) {
    const out = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: orderId } });
      if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
      if (!['PENDING_CONFIRMATION', 'CONFIRMED', 'ON_HOLD'].includes(o.status)) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          'Chỉ đặt được phí giao hàng trước khi đơn vào khâu đóng gói.',
        );
      }
      const fee = BigInt(feeVnd);
      const total = o.subtotalVnd - o.discountVnd + fee;
      await tx.order.update({
        where: { id: o.id },
        data: { shippingFeeVnd: fee, totalVnd: total },
      });
      await tx.payment.updateMany({
        where: { orderId: o.id, status: 'PENDING' },
        data: { amountVnd: total },
      });
      await this.audit.record(
        {
          actorId: actor.userId,
          actorRole: actor.role ?? null,
          action: 'order.shipping_fee_set',
          entityType: 'order',
          entityId: o.id,
          before: { shippingFeeVnd: o.shippingFeeVnd, totalVnd: o.totalVnd },
          after: { shippingFeeVnd: fee, totalVnd: total },
          requestId,
          ipHash: actor.ipHash ?? null,
        },
        tx,
      );
      return { userId: o.userId, status: o.status, totalVnd: vndToJson(total) };
    });
    this.live.emit({ kind: 'order', orderId, userId: out.userId, status: out.status });
    return { id: orderId, shippingFeeVnd: feeVnd, totalVnd: out.totalVnd };
  }

  /** Staff records that the courier handed over the COD cash. Only after delivery, exactly once. */
  async collectCod(actor: Actor, orderId: string, requestId: string) {
    const out = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: orderId } });
      if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
      if (o.paymentMethod !== 'COD' || !['DELIVERED', 'COMPLETED'].includes(o.status)) {
        throw new AppError('INVALID_STATE_TRANSITION', 'Chỉ ghi nhận thu COD cho đơn COD đã giao.');
      }
      const moved = await tx.payment.updateMany({
        where: { orderId: o.id, status: 'PENDING' },
        data: { status: 'PAID' },
      });
      if (moved.count < 1)
        throw new AppError('INVALID_STATE_TRANSITION', 'Khoản COD đã được ghi nhận trước đó.');
      await this.audit.record(
        {
          actorId: actor.userId,
          actorRole: actor.role ?? null,
          action: 'order.cod_collected',
          entityType: 'order',
          entityId: o.id,
          after: { paymentStatus: 'PAID', amountVnd: o.totalVnd },
          requestId,
          ipHash: actor.ipHash ?? null,
        },
        tx,
      );
      await this.outbox.enqueue(
        {
          aggregateType: 'order',
          aggregateId: o.id,
          type: 'order.cod_collected',
          payload: { orderId: o.id },
          dedupeKey: `order.cod_collected:${o.id}`,
        },
        tx,
      );
      return { userId: o.userId, status: o.status };
    });
    this.live.emit({ kind: 'order', orderId, userId: out.userId, status: out.status });
    return { id: orderId, paymentStatus: 'PAID' as const };
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

  private static readonly LIST_INCLUDE = {
    payments: true,
    items: {
      orderBy: { createdAt: 'asc' as const },
      include: {
        variant: {
          include: {
            product: { include: { media: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } },
          },
        },
      },
    },
  };

  private listItem(
    o: Prisma.OrderGetPayload<{ include: typeof OrdersService.LIST_INCLUDE }>,
  ): OrderListItemDto {
    const preview = o.items.slice(0, 3).map((i) => ({
      name: i.nameSnap,
      packLabel: i.packLabelSnap,
      quantity: i.qty,
      imageUrl: i.variant.product.media[0]?.storageKey ?? null,
    }));
    return {
      ...this.summary(o),
      group: orderGroupOf(o.status),
      itemCount: o.items.length,
      preview,
      moreItems: Math.max(0, o.items.length - preview.length),
    };
  }

  private listWhere(
    userId: string,
    q: { status?: string; group?: string },
  ): Prisma.OrderWhereInput {
    const statuses = q.group
      ? [...ORDER_GROUP_STATUSES[q.group as OrderGroup]]
      : q.status
        ? [q.status as OrderStatus]
        : null;
    return {
      userId,
      status: statuses ? { in: statuses } : { not: 'DRAFT' },
    };
  }

  async listOwn(
    userId: string,
    q: { status?: string; group?: string; sort?: string; page: number; limit: number },
  ): Promise<Paginated<OrderListItemDto>> {
    const where = this.listWhere(userId, q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: q.sort === 'oldest' ? 'asc' : 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: OrdersService.LIST_INCLUDE,
      }),
      this.prisma.order.count({ where }),
    ]);
    return new Paginated(
      rows.map((o) => this.listItem(o)),
      q.page,
      q.limit,
      total,
    );
  }

  /** Counters for the "Tổng quan đơn hàng" strip and the tabs. */
  async summaryOwn(userId: string): Promise<Record<OrderGroup | 'all', number>> {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: { userId, status: { not: 'DRAFT' } },
      _count: { _all: true },
    });
    const out = Object.fromEntries(ORDER_GROUPS.map((g) => [g, 0])) as Record<OrderGroup, number>;
    let all = 0;
    for (const r of rows) {
      out[orderGroupOf(r.status)] += r._count._all;
      all += r._count._all;
    }
    return { all, ...out };
  }

  private static readonly DETAIL_INCLUDE = {
    payments: true,
    events: { orderBy: { occurredAt: 'asc' as const } },
    shipment: true,
    items: {
      orderBy: { createdAt: 'asc' as const },
      include: {
        variant: {
          include: {
            product: { include: { media: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } },
          },
        },
      },
    },
  };

  async getOwn(userId: string, id: string): Promise<OrderDetailDto> {
    const o = await this.prisma.order.findFirst({
      where: { id, userId },
      include: OrdersService.DETAIL_INCLUDE,
    });
    if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.'); // out-of-scope ids look identical to missing ones
    return this.detail(o, false);
  }

  /** What the customer may do right now — computed on the server, the UI just renders it. */
  private customerActions(status: OrderStatus): OrderDetailDto['actions'] {
    return {
      cancel:
        status === 'PENDING_CONFIRMATION' || status === 'ON_HOLD'
          ? 'CANCEL'
          : status === 'CONFIRMED'
            ? 'REQUEST_CANCEL'
            : null,
      reorder: status !== 'DRAFT',
      support: status !== 'DRAFT',
    };
  }

  /** `internal` adds buyer contact and raw staff reasons (PII-gated by the caller) — never costs or margins. */
  detail(
    o: Prisma.OrderGetPayload<{ include: typeof OrdersService.DETAIL_INCLUDE }>,
    internal: boolean,
  ): OrderDetailDto {
    const actorOf = (id: string | null): 'CUSTOMER' | 'STAFF' | 'SYSTEM' =>
      id === null ? 'SYSTEM' : id === o.userId ? 'CUSTOMER' : 'STAFF';
    const safeReason = (code: string | null): string | null =>
      code !== null && (internal || PUBLIC_CANCEL_REASONS.includes(code)) ? code : null;
    const cancelEvent = [...o.events]
      .reverse()
      .find((e) => e.toStatus === 'CANCELLED' || e.toStatus === 'CANCEL_REQUESTED');
    const payment = o.payments[0];
    return {
      ...this.summary(o),
      group: orderGroupOf(o.status),
      shipAddress: o.shipAddressSnapshot,
      subtotalVnd: vndToJson(o.subtotalVnd),
      discountVnd: vndToJson(o.discountVnd),
      items: o.items.map((i) => ({
        id: i.id,
        sku: i.skuSnap,
        name: i.nameSnap,
        packLabel: i.packLabelSnap,
        quantity: i.qty,
        unitPriceVnd: vndToJson(i.unitPriceVnd),
        lineTotalVnd: vndToJson(i.lineTotalVnd),
        imageUrl: i.variant.product.media[0]?.storageKey ?? null,
      })),
      payment: {
        method: o.paymentMethod,
        status: payment?.status ?? 'PENDING',
        updatedAt: payment?.updatedAt ?? o.createdAt,
      },
      shipment: o.shipment
        ? {
            carrier: o.shipment.carrier,
            trackingCode: o.shipment.trackingCode,
            shippedAt: o.shipment.shippedAt,
            deliveredAt: o.shipment.deliveredAt,
          }
        : null,
      cancel: cancelEvent
        ? {
            status: cancelEvent.toStatus as 'CANCELLED' | 'CANCEL_REQUESTED',
            by: actorOf(cancelEvent.actorId),
            reasonCode: safeReason(cancelEvent.reasonCode),
            at: cancelEvent.occurredAt,
          }
        : null,
      timeline: o.events.map((e) => ({
        from: e.fromStatus,
        to: e.toStatus,
        at: e.occurredAt,
        by: actorOf(e.actorId),
        reasonCode:
          e.toStatus === 'CANCELLED' || e.toStatus === 'CANCEL_REQUESTED'
            ? safeReason(e.reasonCode)
            : null,
      })),
      actions: this.customerActions(o.status),
      ...(internal ? { contact: o.contactSnapshot } : {}),
    };
  }

  /** "Mua lại": put the order lines back into the cart (current price/stock rules apply). Idempotent per key. */
  async reorder(actor: Actor, orderId: string, idempotencyKey: string) {
    return this.idempotency.execute(
      {
        actorScope: actor.userId,
        scope: 'orders.reorder',
        key: idempotencyKey,
        requestHash: canonicalHash({ orderId }),
      },
      async () => {
        const o = await this.prisma.order.findFirst({
          where: { id: orderId, userId: actor.userId },
          include: { items: true },
        });
        if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
        let added = 0;
        const skipped: { name: string; message: string }[] = [];
        for (const i of o.items) {
          try {
            await this.cart.add(actor.userId, i.variantId, i.qty);
            added++;
          } catch (e) {
            if (e instanceof AppError) skipped.push({ name: i.nameSnap, message: e.message });
            else throw e;
          }
        }
        return { status: 200, body: { added, skipped } };
      },
    );
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
      include: { ...OrdersService.DETAIL_INCLUDE, financial: true },
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
