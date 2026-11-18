import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Realm } from '../auth/decorators';
import { PublicProductsQueryDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

/** Public catalog: ACTIVE products only. Never exposes cost, DRAFT items or source provenance. */
@ApiTags('Catalog')
@Public()
@Realm('CUSTOMER')
@Controller('v1')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List ACTIVE categories with ACTIVE product counts' })
  categories() {
    return this.catalog.listCategories();
  }

  @Get('products')
  @ApiOperation({
    summary: 'List/search ACTIVE products (query: category, search, sort, page, limit)',
  })
  products(@Query() q: PublicProductsQueryDto) {
    return this.catalog.listProducts(q);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Product detail (404 for DRAFT/unknown)' })
  product(@Param('slug') slug: string) {
    return this.catalog.getProduct(slug);
  }
}
