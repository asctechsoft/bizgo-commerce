import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const PUBLIC_SORTS = ['name', '-name', 'newest'] as const;
export const ADMIN_SORTS = ['name', '-name', 'newest', 'source_index', 'status'] as const;
export const PRODUCT_STATUS_VALUES = [
  'DRAFT',
  'UNDER_REVIEW',
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
] as const;

class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @ApiPropertyOptional({ default: 24, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PublicProductsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: 'Diacritic-insensitive text search' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: PUBLIC_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(PUBLIC_SORTS as unknown as string[])
  sort?: (typeof PUBLIC_SORTS)[number];
}

export class AdminProductsQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: PRODUCT_STATUS_VALUES })
  @IsOptional()
  @IsIn(PRODUCT_STATUS_VALUES as unknown as string[])
  status?: (typeof PRODUCT_STATUS_VALUES)[number];
  @ApiPropertyOptional({ enum: ADMIN_SORTS, default: 'source_index' })
  @IsOptional()
  @IsIn(ADMIN_SORTS as unknown as string[])
  sort?: (typeof ADMIN_SORTS)[number];
}

/** Public DTOs: no cost, no internal status detail, no source provenance. */
export interface PublicCategoryDto {
  id: string;
  slug: string;
  name: string;
  activeProductCount: number;
}

export interface PublicProductDto {
  id: string;
  slug: string;
  name: string;
  /** false while the source item is DRAFT: browsable, but no SKU/price/stock is verified so it cannot be bought. */
  sellable: boolean;
  category: { slug: string; name: string };
  image: { url: string; isIllustrative: boolean } | null;
}

export interface PublicVariantDto {
  id: string;
  sku: string;
  packLabel: string;
  netWeightG: number | null;
  storageClass: string | null;
  minQty: number;
  maxQty: number | null;
  quantityStep: number;
  /** Retail unit price at the minimum quantity; null when no live price rule exists. Never a cost. */
  unitPriceVnd: number | null;
  inStock: boolean;
}

export interface PublicProductDetailDto extends PublicProductDto {
  note: string | null;
  /** Only ACTIVE variants that passed the SKU readiness gate. */
  variants: PublicVariantDto[];
}

export interface AdminCategoryDto {
  id: string;
  slug: string;
  sourceName: string;
  displayName: string;
  sortOrder: number;
  status: string;
  productCount: number;
}

export interface AdminProductDto {
  id: string;
  slug: string;
  sourceIndex: number;
  sourceName: string;
  sourceUnitText: string;
  sourceNoteRaw: string;
  displayName: string;
  displayNote: string;
  originType: string;
  status: string;
  category: { id: string; slug: string; displayName: string };
  media: { id: string; url: string; isIllustrative: boolean; verified: boolean }[];
  aliases: string[];
  createdAt: Date;
  updatedAt: Date;
}
