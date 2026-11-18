import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  CUSTOMER_CANCEL_REASONS,
  ORDER_GROUPS,
  SUPPORT_STATUSES,
  SUPPORT_TYPES,
} from '@bizgo/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const int = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));

export class CartAddDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(100_000) quantity!: number;
}

export class CartPatchDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(100_000) quantity!: number;
}

export class QuoteItemDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(100_000) quantity!: number;
}

export class QuoteRequestDto {
  @ApiPropertyOptional({ type: [QuoteItemDto], description: 'Defaults to the server cart' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsUUID() addressId?: string;
}

export class CreateOrderDto {
  @ApiProperty() @IsUUID() checkoutQuoteId!: string;
  @ApiProperty() @IsInt() @Min(1) acceptedQuoteVersion!: number;
  @ApiProperty({ enum: ['COD', 'BANK_TRANSFER'] }) @IsIn(['COD', 'BANK_TRANSFER']) paymentMethod!:
    | 'COD'
    | 'BANK_TRANSFER';
}

export class OrdersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => int(value))
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => int(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'ON_HOLD',
    'CANCEL_REQUESTED',
    'CANCELLED',
    'PACKING',
    'READY_TO_SHIP',
    'SHIPPED',
    'DELIVERED',
    'COMPLETED',
  ])
  status?: string;
  @ApiPropertyOptional({ enum: ORDER_GROUPS })
  @IsOptional()
  @IsIn(ORDER_GROUPS as unknown as string[])
  group?: string;
  @ApiPropertyOptional({ enum: ['newest', 'oldest'] })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: string;
}

export class OrderActionDto {
  @ApiPropertyOptional({ description: 'Short reason code, recorded in the audit trail' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_ .:-]+$/)
  reason?: string;
}

export class VariantCreateDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty() @IsString() @Length(3, 64) @Matches(/^[A-Za-z0-9._-]+$/) sku!: string;
  @ApiProperty() @IsString() @Length(1, 120) packLabel!: string;
  @ApiProperty() @IsString() @Length(1, 40) sellableUnit!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000_000) netWeightG?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000) piecesPerPack?: number;
  @ApiPropertyOptional({ enum: ['DRY', 'AMBIENT', 'CHILLED', 'FROZEN', 'FRAGILE'] })
  @IsOptional()
  @IsIn(['DRY', 'AMBIENT', 'CHILLED', 'FROZEN', 'FRAGILE'])
  storageClass?: 'DRY' | 'AMBIENT' | 'CHILLED' | 'FROZEN' | 'FRAGILE';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000) minQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000) maxQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000) quantityStep?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) manufacturer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) responsibleEntity?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(3650) shelfLifeDays?: number;
}

export class PriceCreateDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty({ description: 'Integer VND (đồng)' })
  @IsInt()
  @Min(0)
  @Max(MAX_SAFE)
  unitPriceVnd!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000) minQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() validFrom?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() validTo?: Date;
}

export class CostCreateDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty({ description: 'Integer VND (đồng)' })
  @IsInt()
  @Min(0)
  @Max(MAX_SAFE)
  costVnd!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() validFrom?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() validTo?: Date;
}

export class WarehouseCreateDto {
  @ApiProperty() @IsString() @Length(2, 40) @Matches(/^[A-Za-z0-9_-]+$/) code!: string;
  @ApiProperty() @IsString() @Length(2, 120) name!: string;
}

export class AdjustmentDto {
  @ApiProperty() @IsUUID() warehouseId!: string;
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty({ description: 'Signed integer; negative reduces stock' })
  @IsInt()
  @Min(-1_000_000_000)
  @Max(1_000_000_000)
  delta!: number;
  @ApiProperty() @IsString() @Length(2, 60) @Matches(/^[A-Z0-9_]+$/) reasonCode!: string;
}

export class InventoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() variantId?: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional({ enum: CUSTOMER_CANCEL_REASONS })
  @IsOptional()
  @IsIn(CUSTOMER_CANCEL_REASONS as unknown as string[])
  reason?: string;
}

export class ShipOrderDto extends OrderActionDto {
  @ApiProperty() @IsString() @Length(2, 80) carrier!: string;
  @ApiProperty() @IsString() @Length(3, 80) @Matches(/^[A-Za-z0-9._-]+$/) trackingCode!: string;
}

export class ShippingFeeDto {
  @ApiProperty({ description: 'Integer VND (đồng)' })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  feeVnd!: number;
}

export class SupportCreateDto {
  @ApiProperty({ enum: SUPPORT_TYPES }) @IsIn(SUPPORT_TYPES as unknown as string[]) type!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  orderItemIds?: string[];
  @ApiProperty() @IsString() @Length(5, 500) description!: string;
}

export class SupportMessageDto {
  @ApiProperty() @IsString() @Length(1, 1000) body!: string;
}

export class SupportStatusDto {
  @ApiProperty({ enum: SUPPORT_STATUSES })
  @IsIn(SUPPORT_STATUSES as unknown as string[])
  status!: string;
}

export class SupportQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(SUPPORT_STATUSES as unknown as string[])
  status?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => int(value))
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => int(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
