import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { AppError } from '@bizgo/shared';
import { RawResponse } from '../common/http';
import type { AuthContext } from '../auth/auth.types';
import {
  CurrentAuth,
  Realm,
  RequestMeta,
  RequireFreshMfa,
  RequirePermissions,
} from '../auth/decorators';
import { CartService } from './cart.service';
import {
  AdjustmentDto,
  CancelOrderDto,
  CartAddDto,
  CartPatchDto,
  CostCreateDto,
  CreateOrderDto,
  InventoryQueryDto,
  OrderActionDto,
  OrdersQueryDto,
  PriceCreateDto,
  QuoteRequestDto,
  ShipOrderDto,
  ShippingFeeDto,
  SupportCreateDto,
  SupportMessageDto,
  SupportQueryDto,
  SupportStatusDto,
  VariantCreateDto,
  WarehouseCreateDto,
} from './commerce.dto';
import { InventoryService } from './inventory.service';
import { IdempotencyService } from '../infra/idempotency.service';
import { OrderEventsService } from './order-events.service';
import { OrdersService, type AdminOrderAction } from './orders.service';
import { SupportService } from './support.service';
import { QuoteService } from './quote.service';
import { VariantsAdminService } from './variants-admin.service';
import { canonicalHash } from '../common/crypto';

type Meta = { ip: string | null; ua: string | null; requestId: string };

function requireKey(key: string | undefined): string {
  if (!key) throw new AppError('VALIDATION_ERROR', 'Thiếu header Idempotency-Key.');
  return key;
}

const IDEM = {
  name: 'Idempotency-Key',
  required: true,
  description: '16–128 chars, unique per attempt',
} as const;

// ───────────────────────────── customer: cart / checkout / orders ─────────────────────────────

@ApiTags('Cart')
@ApiBearerAuth()
@Realm('CUSTOMER')
@RequirePermissions('cart:own')
@Controller('v1/cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentAuth() a: AuthContext) {
    return this.cart.get(a.userId);
  }

  @Post('items')
  add(@CurrentAuth() a: AuthContext, @Body() dto: CartAddDto) {
    return this.cart.add(a.userId, dto.variantId, dto.quantity);
  }

  @Patch('items/:id')
  patch(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CartPatchDto,
  ) {
    return this.cart.setQuantity(a.userId, id, dto.quantity);
  }

  @Delete('items/:id')
  remove(@CurrentAuth() a: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.cart.remove(a.userId, id);
  }
}

@ApiTags('Checkout')
@ApiBearerAuth()
@Realm('CUSTOMER')
@RequirePermissions('checkout:create')
@Controller('v1')
export class CheckoutController {
  constructor(
    private readonly quotes: QuoteService,
    private readonly orders: OrdersService,
  ) {}

  @Post('checkout/quote')
  @HttpCode(200)
  quote(@CurrentAuth() a: AuthContext, @Body() dto: QuoteRequestDto) {
    return this.quotes.create(a.userId, { items: dto.items, addressId: dto.addressId ?? null });
  }

  @Post('orders')
  @ApiHeader(IDEM)
  async create(
    @CurrentAuth() a: AuthContext,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') key: string | undefined,
    @RequestMeta() meta: Meta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.orders.create(
      { userId: a.userId, role: a.roles.join(','), ipHash: a.ipHash },
      dto,
      requireKey(key),
      meta.requestId,
    );
    res.status(r.status);
    if (r.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return r.body;
  }
}

@ApiTags('Orders')
@ApiBearerAuth()
@Realm('CUSTOMER')
@Controller('v1/me/orders')
export class MeOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly support: SupportService,
    private readonly live: OrderEventsService,
  ) {}

  @Get()
  @RequirePermissions('order:read:own')
  list(@CurrentAuth() a: AuthContext, @Query() q: OrdersQueryDto) {
    return this.orders.listOwn(a.userId, {
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      ...(q.status ? { status: q.status } : {}),
      ...(q.group ? { group: q.group } : {}),
      ...(q.sort ? { sort: q.sort } : {}),
    });
  }

  @Get('summary')
  @RequirePermissions('order:read:own')
  summary(@CurrentAuth() a: AuthContext) {
    return this.orders.summaryOwn(a.userId);
  }

  /** Server-Sent Events: "an order of yours changed" (browser refetches; no order data on the wire). */
  @Sse('stream')
  @RawResponse()
  @RequirePermissions('order:read:own')
  stream(@CurrentAuth() a: AuthContext): Observable<MessageEvent> {
    return this.live.stream(a.userId).pipe(map((m) => ({ type: m.type, data: m.data as object })));
  }

  @Get(':id')
  @RequirePermissions('order:read:own')
  get(@CurrentAuth() a: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.getOwn(a.userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:cancel:own')
  async cancel(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
    @Headers('idempotency-key') key: string | undefined,
    @RequestMeta() meta: Meta,
  ) {
    const r = await this.orders.cancelOwn(
      { userId: a.userId, role: a.roles.join(','), ipHash: a.ipHash },
      id,
      requireKey(key),
      meta.requestId,
      dto.reason,
    );
    return r.body;
  }

  @Post(':id/reorder')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('cart:own')
  async reorder(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const r = await this.orders.reorder({ userId: a.userId }, id, requireKey(key));
    return r.body;
  }

  @Get(':id/support')
  @RequirePermissions('order:read:own')
  listSupport(@CurrentAuth() a: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.support.listForOrder(a.userId, id);
  }

  @Post(':id/support')
  @RequirePermissions('order:read:own')
  createSupport(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SupportCreateDto,
    @RequestMeta() meta: Meta,
  ) {
    return this.support.create(a.userId, id, dto, meta.requestId);
  }
}

@ApiTags('Support')
@ApiBearerAuth()
@Realm('CUSTOMER')
@Controller('v1/me/support')
export class MeSupportController {
  constructor(private readonly support: SupportService) {}

  @Post(':id/messages')
  @RequirePermissions('order:read:own')
  reply(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SupportMessageDto,
  ) {
    return this.support.customerReply(a.userId, id, dto.body);
  }
}

// ───────────────────────────── admin: catalog commerce, inventory, orders ─────────────────────────────

@ApiTags('Admin Commerce')
@ApiBearerAuth()
@Realm('ADMIN')
@Controller('v1/admin')
export class AdminCommerceController {
  constructor(
    private readonly variants: VariantsAdminService,
    private readonly inventory: InventoryService,
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly support: SupportService,
    private readonly live: OrderEventsService,
  ) {}

  @Post('variants')
  @RequirePermissions('catalog:write')
  createVariant(
    @CurrentAuth() a: AuthContext,
    @Body() dto: VariantCreateDto,
    @RequestMeta() m: Meta,
  ) {
    return this.variants.create(a.userId, dto, m.requestId);
  }

  @Get('products/:id/variants')
  @RequirePermissions('catalog:read:all')
  listVariants(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.variants.list(id);
  }

  @Get('variants/:id/readiness')
  @RequirePermissions('catalog:read:all')
  readiness(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.variants.readiness(id);
  }

  @Post('variants/:id/publish')
  @HttpCode(200)
  @RequirePermissions('variant:publish')
  @RequireFreshMfa(300)
  publish(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @RequestMeta() m: Meta,
  ) {
    return this.variants.publish(a.userId, id, m.requestId);
  }

  @Post('prices')
  @RequirePermissions('price:write')
  @RequireFreshMfa(300)
  setPrice(@CurrentAuth() a: AuthContext, @Body() dto: PriceCreateDto, @RequestMeta() m: Meta) {
    return this.variants.setPrice(a.userId, dto, m.requestId);
  }

  @Post('costs')
  @RequirePermissions('cost:write')
  @RequireFreshMfa(300)
  setCost(@CurrentAuth() a: AuthContext, @Body() dto: CostCreateDto, @RequestMeta() m: Meta) {
    return this.variants.setCost(a.userId, dto, m.requestId);
  }

  @Post('warehouses')
  @RequirePermissions('inventory:adjust')
  createWarehouse(
    @CurrentAuth() a: AuthContext,
    @Body() dto: WarehouseCreateDto,
    @RequestMeta() m: Meta,
  ) {
    return this.variants.createWarehouse(a.userId, dto, m.requestId);
  }

  @Get('warehouses')
  @RequirePermissions('inventory:read')
  listWarehouses() {
    return this.variants.listWarehouses();
  }

  @Get('inventory')
  @RequirePermissions('inventory:read')
  listInventory(@Query() q: InventoryQueryDto) {
    return this.variants.inventory(q);
  }

  @Post('inventory/adjustments')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('inventory:adjust')
  async adjust(
    @CurrentAuth() a: AuthContext,
    @Body() dto: AdjustmentDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const r = await this.idempotency.execute(
      {
        actorScope: a.userId,
        scope: 'inventory.adjust',
        key: requireKey(key),
        requestHash: canonicalHash(dto),
      },
      async () => {
        const b = await this.inventory.adjust({ ...dto, actorId: a.userId });
        return {
          status: 200,
          body: {
            onHand: Number(b.onHand),
            reserved: Number(b.reserved),
            available: Number(b.available),
          },
        };
      },
    );
    return r.body;
  }

  @Get('orders')
  @RequirePermissions('order:read:all')
  listOrders(@Query() q: OrdersQueryDto) {
    return this.orders.adminList({
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      ...(q.status ? { status: q.status } : {}),
    });
  }

  @Get('orders/:id')
  @RequirePermissions('order:read:all')
  getOrder(@CurrentAuth() a: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.adminGet(id, {
      pii: a.permissions.has('pii:read'),
      margin: a.permissions.has('margin:read'),
    });
  }

  private act(
    a: AuthContext,
    id: string,
    action: AdminOrderAction,
    dto: OrderActionDto,
    key: string | undefined,
    m: Meta,
    shipment?: { carrier: string; trackingCode: string },
  ) {
    return this.orders
      .adminAction(
        { userId: a.userId, role: a.roles.join(','), ipHash: a.ipHash },
        id,
        action,
        dto.reason,
        requireKey(key),
        m.requestId,
        shipment,
      )
      .then((r) => r.body);
  }

  @Post('orders/:id/confirm')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  confirm(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.act(a, id, 'CONFIRM', dto, k, m);
  }

  @Post('orders/:id/hold')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  hold(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.act(a, id, 'HOLD', dto, k, m);
  }

  @Post('orders/:id/resume')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  resume(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.act(a, id, 'RESUME', dto, k, m);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  cancel(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.act(a, id, 'CANCEL', dto, k, m);
  }

  private flow(
    a: AuthContext,
    id: string,
    action: AdminOrderAction,
    dto: OrderActionDto,
    k: string | undefined,
    m: Meta,
  ) {
    return this.act(a, id, action, dto, k, m);
  }

  @Post('orders/:id/reject-cancel')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  rejectCancel(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.flow(a, id, 'REJECT_CANCEL', dto, k, m);
  }

  @Post('orders/:id/pack')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  pack(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.flow(a, id, 'START_PACKING', dto, k, m);
  }

  @Post('orders/:id/ready')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  ready(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.flow(a, id, 'MARK_READY', dto, k, m);
  }

  @Post('orders/:id/ship')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  ship(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ShipOrderDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.act(a, id, 'SHIP', dto, k, m, {
      carrier: dto.carrier,
      trackingCode: dto.trackingCode,
    });
  }

  @Post('orders/:id/deliver')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  deliver(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.flow(a, id, 'DELIVER', dto, k, m);
  }

  @Post('orders/:id/complete')
  @HttpCode(200)
  @ApiHeader(IDEM)
  @RequirePermissions('order:manage')
  complete(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OrderActionDto,
    @Headers('idempotency-key') k: string | undefined,
    @RequestMeta() m: Meta,
  ) {
    return this.flow(a, id, 'COMPLETE', dto, k, m);
  }

  @Post('orders/:id/shipping-fee')
  @HttpCode(200)
  @RequirePermissions('order:manage')
  shippingFee(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ShippingFeeDto,
    @RequestMeta() m: Meta,
  ) {
    return this.orders.setShippingFee(
      { userId: a.userId, role: a.roles.join(','), ipHash: a.ipHash },
      id,
      dto.feeVnd,
      m.requestId,
    );
  }

  @Post('orders/:id/collect-cod')
  @HttpCode(200)
  @RequirePermissions('order:manage')
  collectCod(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @RequestMeta() m: Meta,
  ) {
    return this.orders.collectCod(
      { userId: a.userId, role: a.roles.join(','), ipHash: a.ipHash },
      id,
      m.requestId,
    );
  }

  /** Staff live stream (all orders + support activity). Browser refetches on each event. */
  @Sse('stream')
  @RawResponse()
  @RequirePermissions('order:read:all')
  stream(): Observable<MessageEvent> {
    return this.live.stream(undefined).pipe(map((m) => ({ type: m.type, data: m.data as object })));
  }

  @Get('support')
  @RequirePermissions('support:handle')
  listSupport(@Query() q: SupportQueryDto) {
    return this.support.adminList({
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      status: q.status,
    });
  }

  @Get('support/:id')
  @RequirePermissions('support:handle')
  getSupport(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.support.adminGet(id);
  }

  @Post('support/:id/messages')
  @RequirePermissions('support:handle')
  replySupport(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SupportMessageDto,
    @RequestMeta() m: Meta,
  ) {
    return this.support.staffReply(a.userId, id, dto.body, m.requestId);
  }

  @Post('support/:id/status')
  @HttpCode(200)
  @RequirePermissions('support:handle')
  setSupportStatus(
    @CurrentAuth() a: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SupportStatusDto,
    @RequestMeta() m: Meta,
  ) {
    return this.support.setStatus(a.userId, id, dto.status, m.requestId);
  }
}
