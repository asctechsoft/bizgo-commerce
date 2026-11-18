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
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppError } from '@bizgo/shared';
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
  CartAddDto,
  CartPatchDto,
  CostCreateDto,
  CreateOrderDto,
  InventoryQueryDto,
  OrderActionDto,
  OrdersQueryDto,
  PriceCreateDto,
  QuoteRequestDto,
  VariantCreateDto,
  WarehouseCreateDto,
} from './commerce.dto';
import { InventoryService } from './inventory.service';
import { IdempotencyService } from '../infra/idempotency.service';
import { OrdersService } from './orders.service';
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
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('order:read:own')
  list(@CurrentAuth() a: AuthContext, @Query() q: OrdersQueryDto) {
    return this.orders.listOwn(a.userId, {
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      ...(q.status ? { status: q.status } : {}),
    });
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
    @Headers('idempotency-key') key: string | undefined,
    @RequestMeta() meta: Meta,
  ) {
    const r = await this.orders.cancelOwn(
      { userId: a.userId, role: a.roles.join(','), ipHash: a.ipHash },
      id,
      requireKey(key),
      meta.requestId,
    );
    return r.body;
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
    action: 'CONFIRM' | 'HOLD' | 'RESUME' | 'CANCEL',
    dto: OrderActionDto,
    key: string | undefined,
    m: Meta,
  ) {
    return this.orders
      .adminAction(
        { userId: a.userId, role: a.roles.join(','), ipHash: a.ipHash },
        id,
        action,
        dto.reason,
        requireKey(key),
        m.requestId,
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
}
