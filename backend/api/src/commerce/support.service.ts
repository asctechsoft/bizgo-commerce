import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bizgo/db';
import { AppError, type SupportStatusCode, type SupportTypeCode } from '@bizgo/shared';
import { Paginated } from '../common/http';
import { AuditService } from '../infra/audit.service';
import { PrismaService } from '../infra/prisma.service';
import { OrderEventsService } from './order-events.service';

const MAX_OPEN_PER_ORDER = 5;

export interface SupportDto {
  id: string;
  orderId: string;
  orderNumber: string;
  type: SupportTypeCode;
  status: SupportStatusCode;
  description: string;
  orderItems: { id: string; name: string; packLabel: string; quantity: number }[];
  createdAt: Date;
  updatedAt: Date;
  messages: { id: string; from: 'CUSTOMER' | 'STAFF'; body: string; at: Date }[];
  customerName?: string;
}

const INCLUDE = {
  order: { include: { items: true, user: { select: { displayName: true } } } },
  messages: { orderBy: { createdAt: 'asc' as const } },
};

type Row = Prisma.SupportRequestGetPayload<{ include: typeof INCLUDE }>;

/** Customer ↔ staff support requests about an order (no refund automation; evidence upload is a later phase). */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly live: OrderEventsService,
  ) {}

  private toDto(r: Row, withCustomer = false): SupportDto {
    const ids = new Set((r.orderItemIds as string[]) ?? []);
    return {
      id: r.id,
      orderId: r.orderId,
      orderNumber: r.order.orderNumber,
      type: r.type,
      status: r.status,
      description: r.description,
      orderItems: r.order.items
        .filter((i) => ids.has(i.id))
        .map((i) => ({ id: i.id, name: i.nameSnap, packLabel: i.packLabelSnap, quantity: i.qty })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messages: r.messages.map((m) => ({
        id: m.id,
        from: m.authorType === 'STAFF' ? 'STAFF' : 'CUSTOMER',
        body: m.body,
        at: m.createdAt,
      })),
      ...(withCustomer ? { customerName: r.order.user.displayName } : {}),
    };
  }

  // ───────────── customer ─────────────

  async create(
    userId: string,
    orderId: string,
    dto: { type: string; orderItemIds?: string[] | undefined; description: string },
    requestId: string,
  ): Promise<SupportDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });
    if (!order || order.status === 'DRAFT')
      throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
    const valid = new Set(order.items.map((i) => i.id));
    const picked = [...new Set(dto.orderItemIds ?? [])];
    if (picked.some((id) => !valid.has(id)))
      throw new AppError('VALIDATION_ERROR', 'Sản phẩm không thuộc đơn hàng này.');
    const open = await this.prisma.supportRequest.count({
      where: { orderId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    if (open >= MAX_OPEN_PER_ORDER)
      throw new AppError('RATE_LIMITED', 'Đơn này đã có nhiều yêu cầu đang xử lý.');
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportRequest.create({
        data: {
          orderId,
          userId,
          type: dto.type as SupportTypeCode,
          orderItemIds: picked,
          description: dto.description.trim(),
        },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          actorId: userId,
          action: 'support.created',
          entityType: 'support_request',
          entityId: created.id,
          after: { orderId, type: dto.type },
          requestId,
        },
        tx,
      );
      return created;
    });
    this.live.emit({ kind: 'support', orderId, userId, supportId: row.id });
    return this.toDto(row);
  }

  async listForOrder(userId: string, orderId: string): Promise<SupportDto[]> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn hàng.');
    const rows = await this.prisma.supportRequest.findMany({
      where: { orderId, userId },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
    return rows.map((r) => this.toDto(r));
  }

  async customerReply(userId: string, id: string, body: string): Promise<SupportDto> {
    const r = await this.prisma.supportRequest.findFirst({ where: { id, userId } });
    if (!r) throw new AppError('NOT_FOUND', 'Không tìm thấy yêu cầu hỗ trợ.');
    if (r.status === 'CLOSED')
      throw new AppError('INVALID_STATE_TRANSITION', 'Yêu cầu đã đóng. Vui lòng tạo yêu cầu mới.');
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: { requestId: id, authorType: 'CUSTOMER', authorId: userId, body: body.trim() },
      });
      return tx.supportRequest.update({
        where: { id },
        data: { status: r.status === 'RESOLVED' ? 'OPEN' : r.status },
        include: INCLUDE,
      });
    });
    this.live.emit({ kind: 'support', orderId: r.orderId, userId, supportId: id });
    return this.toDto(row);
  }

  // ───────────── staff ─────────────

  async adminList(q: {
    status?: string | undefined;
    page: number;
    limit: number;
  }): Promise<Paginated<SupportDto>> {
    const where: Prisma.SupportRequestWhereInput = q.status
      ? { status: q.status as SupportStatusCode }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportRequest.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: INCLUDE,
      }),
      this.prisma.supportRequest.count({ where }),
    ]);
    return new Paginated(
      rows.map((r) => this.toDto(r, true)),
      q.page,
      q.limit,
      total,
    );
  }

  async adminGet(id: string): Promise<SupportDto> {
    const r = await this.prisma.supportRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new AppError('NOT_FOUND', 'Không tìm thấy yêu cầu hỗ trợ.');
    return this.toDto(r, true);
  }

  async staffReply(
    actorId: string,
    id: string,
    body: string,
    requestId: string,
  ): Promise<SupportDto> {
    const r = await this.prisma.supportRequest.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Không tìm thấy yêu cầu hỗ trợ.');
    if (r.status === 'CLOSED') throw new AppError('INVALID_STATE_TRANSITION', 'Yêu cầu đã đóng.');
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: { requestId: id, authorType: 'STAFF', authorId: actorId, body: body.trim() },
      });
      const updated = await tx.supportRequest.update({
        where: { id },
        data: { status: r.status === 'OPEN' ? 'IN_PROGRESS' : r.status },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          actorId,
          action: 'support.replied',
          entityType: 'support_request',
          entityId: id,
          requestId,
        },
        tx,
      );
      return updated;
    });
    this.live.emit({ kind: 'support', orderId: r.orderId, userId: r.userId, supportId: id });
    return this.toDto(row, true);
  }

  async setStatus(
    actorId: string,
    id: string,
    status: string,
    requestId: string,
  ): Promise<SupportDto> {
    const r = await this.prisma.supportRequest.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Không tìm thấy yêu cầu hỗ trợ.');
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportRequest.update({
        where: { id },
        data: { status: status as SupportStatusCode },
        include: INCLUDE,
      });
      await this.audit.record(
        {
          actorId,
          action: 'support.status_changed',
          entityType: 'support_request',
          entityId: id,
          before: { status: r.status },
          after: { status },
          requestId,
        },
        tx,
      );
      return updated;
    });
    this.live.emit({ kind: 'support', orderId: r.orderId, userId: r.userId, supportId: id });
    return this.toDto(row, true);
  }
}
