import { Injectable } from '@nestjs/common';
import { AppError, vndToJson } from '@bizgo/shared';
import { Clock } from '../common/clock';
import { PrismaService } from '../infra/prisma.service';
import { resolveUnitPrice } from './pricing.engine';

export interface CartDto {
  items: {
    id: string;
    variantId: string;
    sku: string;
    name: string;
    packLabel: string;
    quantity: number;
    /** informational only; checkout always re-prices on the server */
    unitPriceVnd: number | null;
    available: boolean;
  }[];
  note: 'ESTIMATE_ONLY';
}

const MAX_LINES = 50;
const MAX_QTY = 100_000;

/** Server-side customer cart. Totals are informational: checkout re-prices (ADR-0010). */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  private async ensure(userId: string) {
    return this.prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async get(userId: string): Promise<CartDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            variant: {
              include: {
                product: true,
                priceRules: { where: { channel: 'RETAIL' } },
                balances: true,
              },
            },
          },
        },
      },
    });
    const now = this.clock.now();
    return {
      note: 'ESTIMATE_ONLY',
      items: (cart?.items ?? []).map((i) => {
        const v = i.variant;
        const price = resolveUnitPrice(v.priceRules, i.quantity, now);
        const stock = v.balances.reduce((a, b) => a + (b.onHand - b.reserved - b.quarantined), 0n);
        return {
          id: i.id,
          variantId: v.id,
          sku: v.sku,
          name: v.product.displayName,
          packLabel: v.packLabel,
          quantity: i.quantity,
          unitPriceVnd: price === null ? null : vndToJson(price),
          available:
            v.status === 'ACTIVE' && v.product.status === 'ACTIVE' && stock >= BigInt(i.quantity),
        };
      }),
    };
  }

  async add(userId: string, variantId: string, quantity: number): Promise<CartDto> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });
    if (!variant || variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE') {
      // DRAFT SKUs cannot even enter a cart (Spec §10.2: CTA disabled for DRAFT/unsupported)
      throw new AppError('SKU_NOT_READY', 'Sản phẩm này chưa được mở bán.');
    }
    const cart = await this.ensure(userId);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    const next = (existing?.quantity ?? 0) + quantity;
    if (next > MAX_QTY) throw new AppError('QUANTITY_INVALID', 'Số lượng vượt giới hạn cho phép.');
    if (!existing) {
      const count = await this.prisma.cartItem.count({ where: { cartId: cart.id } });
      if (count >= MAX_LINES)
        throw new AppError('VALIDATION_ERROR', 'Giỏ hàng có quá nhiều dòng sản phẩm.');
    }
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      update: { quantity: next },
      create: { cartId: cart.id, variantId, quantity: quantity },
    });
    return this.get(userId);
  }

  async setQuantity(userId: string, itemId: string, quantity: number): Promise<CartDto> {
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
    if (!item) throw new AppError('NOT_FOUND', 'Không tìm thấy dòng sản phẩm trong giỏ.');
    if (quantity > MAX_QTY)
      throw new AppError('QUANTITY_INVALID', 'Số lượng vượt giới hạn cho phép.');
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    return this.get(userId);
  }

  async remove(userId: string, itemId: string): Promise<CartDto> {
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
    if (!item) throw new AppError('NOT_FOUND', 'Không tìm thấy dòng sản phẩm trong giỏ.');
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.get(userId);
  }
}
