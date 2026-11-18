import { Injectable } from '@nestjs/common';
import type { Prisma } from '@bizgo/db';
import { AppError, normalizeVi, vndToJson } from '@bizgo/shared';
import { Paginated } from '../common/http';
import { Clock } from '../common/clock';
import { resolveUnitPrice } from '../commerce/pricing.engine';
import { PrismaService } from '../infra/prisma.service';
import type {
  AdminCategoryDto,
  AdminProductDto,
  PublicCategoryDto,
  PublicProductDetailDto,
  PublicProductDto,
} from './catalog.dto';

const DEFAULT_LIMIT = 24;

/** Turn user text into AND-ed substring filters over the normalised search column. */
function searchFilter(search: string | undefined): Prisma.ProductWhereInput[] {
  if (!search) return [];
  const tokens = normalizeVi(search)
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 6);
  return tokens.map((t) => ({ searchText: { contains: t } }));
}

function publicSort(sort: string | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case '-name':
      return [{ displayName: 'desc' }, { id: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'asc' }];
    default:
      return [{ displayName: 'asc' }, { id: 'asc' }];
  }
}

function adminSort(sort: string | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'name':
      return [{ displayName: 'asc' }, { id: 'asc' }];
    case '-name':
      return [{ displayName: 'desc' }, { id: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'asc' }];
    case 'status':
      return [{ status: 'asc' }, { sourceIndex: 'asc' }];
    default:
      return [{ sourceIndex: 'asc' }];
  }
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  // ───────────────────────────── Public (ACTIVE only) ─────────────────────────────

  async listCategories(): Promise<PublicCategoryDto[]> {
    const cats = await this.prisma.category.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    });
    const counts = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    });
    const byCat = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.displayName,
      activeProductCount: byCat.get(c.id) ?? 0,
    }));
  }

  async listProducts(q: {
    category?: string;
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }): Promise<Paginated<PublicProductDto>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      category: { status: 'ACTIVE', ...(q.category ? { slug: q.category } : {}) },
      AND: searchFilter(q.search),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: publicSort(q.sort),
        skip: (page - 1) * limit,
        take: limit,
        include: { category: true, media: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return new Paginated(
      rows.map((p) => this.toPublic(p)),
      page,
      limit,
      total,
    );
  }

  async getProduct(slug: string): Promise<PublicProductDetailDto> {
    const now = this.clock.now();
    const p = await this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE', category: { status: 'ACTIVE' } },
      include: {
        category: true,
        media: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          include: { priceRules: { where: { channel: 'RETAIL' } }, balances: true },
        },
      },
    });
    if (!p) throw new AppError('NOT_FOUND', 'Không tìm thấy sản phẩm.');
    const variants = p.variants.map((v) => {
      const price = resolveUnitPrice(v.priceRules, v.minQty, now);
      const available = v.balances.reduce(
        (a, b) => a + (b.onHand - b.reserved - b.quarantined),
        0n,
      );
      return {
        id: v.id,
        sku: v.sku,
        packLabel: v.packLabel,
        netWeightG: v.netWeightG,
        storageClass: v.storageClass,
        minQty: v.minQty,
        maxQty: v.maxQty,
        quantityStep: v.quantityStep,
        unitPriceVnd: price === null ? null : vndToJson(price),
        inStock: available >= BigInt(v.minQty),
      };
    });
    return { ...this.toPublic(p), note: p.displayNote || null, variants };
  }

  private toPublic(p: {
    id: string;
    slug: string;
    displayName: string;
    category: { slug: string; displayName: string };
    media: { storageKey: string; isIllustrative: boolean }[];
  }): PublicProductDto {
    const m = p.media[0];
    return {
      id: p.id,
      slug: p.slug,
      name: p.displayName,
      category: { slug: p.category.slug, name: p.category.displayName },
      image: m ? { url: m.storageKey, isIllustrative: m.isIllustrative } : null,
    };
  }

  // ───────────────────────────── Admin (all statuses) ─────────────────────────────

  async adminCategories(): Promise<AdminCategoryDto[]> {
    const cats = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      sourceName: c.sourceName,
      displayName: c.displayName,
      sortOrder: c.sortOrder,
      status: c.status,
      productCount: c._count.products,
    }));
  }

  async adminProducts(q: {
    category?: string;
    search?: string;
    status?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }): Promise<Paginated<AdminProductDto>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.ProductWhereInput = {
      ...(q.status ? { status: q.status as Prisma.ProductWhereInput['status'] } : {}),
      ...(q.category ? { category: { slug: q.category } } : {}),
      AND: searchFilter(q.search),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: adminSort(q.sort),
        skip: (page - 1) * limit,
        take: limit,
        include: { category: true, media: true, aliases: true },
      }),
      this.prisma.product.count({ where }),
    ]);
    return new Paginated(
      rows.map((p) => this.toAdmin(p)),
      page,
      limit,
      total,
    );
  }

  async adminProduct(id: string): Promise<AdminProductDto> {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, media: true, aliases: true },
    });
    if (!p) throw new AppError('NOT_FOUND', 'Không tìm thấy sản phẩm.');
    return this.toAdmin(p);
  }

  private toAdmin(
    p: Prisma.ProductGetPayload<{ include: { category: true; media: true; aliases: true } }>,
  ): AdminProductDto {
    return {
      id: p.id,
      slug: p.slug,
      sourceIndex: p.sourceIndex,
      sourceName: p.sourceName,
      sourceUnitText: p.sourceUnitText,
      sourceNoteRaw: p.sourceNoteRaw,
      displayName: p.displayName,
      displayNote: p.displayNote,
      originType: p.originType,
      status: p.status,
      category: { id: p.category.id, slug: p.category.slug, displayName: p.category.displayName },
      media: p.media.map((m) => ({
        id: m.id,
        url: m.storageKey,
        isIllustrative: m.isIllustrative,
        verified: !!m.verifiedAt,
      })),
      aliases: p.aliases.map((a) => a.alias),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
