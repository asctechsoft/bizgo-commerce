import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Realm, RequirePermissions } from '../auth/decorators';
import { AdminProductsQueryDto } from '../catalog/catalog.dto';
import { CatalogService } from '../catalog/catalog.service';
import { AdminService } from './admin.service';

class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Return rows with id < before (cursor)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Back-office (realm ADMIN). Every handler declares the permission it needs. */
@ApiTags('Admin Catalog')
@Realm('ADMIN')
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly admin: AdminService,
  ) {}

  @Get('categories')
  @RequirePermissions('catalog:read:all')
  @ApiOperation({ summary: 'All categories incl. non-public' })
  categories() {
    return this.catalog.adminCategories();
  }

  @Get('products')
  @RequirePermissions('catalog:read:all')
  @ApiOperation({ summary: 'All products in every status (82 DRAFT at start)' })
  products(@Query() q: AdminProductsQueryDto) {
    return this.catalog.adminProducts(q);
  }

  @Get('products/:id')
  @RequirePermissions('catalog:read:all')
  product(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.adminProduct(id);
  }

  @ApiTags('Admin System')
  @Get('audit')
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Audit log (cursor pagination, newest first)' })
  audit(@Query() q: AuditQueryDto) {
    return this.admin.audit(q.before, q.limit ?? 50);
  }

  @ApiTags('Admin Users')
  @Get('users')
  @RequirePermissions('user:manage')
  @ApiOperation({ summary: 'Staff users (PII-minimal list)' })
  users() {
    return this.admin.staffUsers();
  }
}
