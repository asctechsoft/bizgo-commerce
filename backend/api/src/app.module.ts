import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AuthModule } from './auth/auth.module';
import { CartService } from './commerce/cart.service';
import {
  AdminCommerceController,
  CartController,
  CheckoutController,
  MeOrdersController,
  MeSupportController,
} from './commerce/commerce.controllers';
import { InventoryService } from './commerce/inventory.service';
import { OrderEventsService } from './commerce/order-events.service';
import { OrdersService } from './commerce/orders.service';
import { SupportService } from './commerce/support.service';
import { QuoteService } from './commerce/quote.service';
import { SettingsService } from './commerce/settings.service';
import { VariantsAdminService } from './commerce/variants-admin.service';
import { CatalogController } from './catalog/catalog.controller';
import { AdminContentController, PublicContentController } from './content/content.controller';
import { ContentService } from './content/content.service';
import { CatalogService } from './catalog/catalog.service';
import { AllExceptionsFilter, EnvelopeInterceptor, RequestIdMiddleware } from './common/http';
import { APP_CONFIG, type AppConfig } from './config/env';
import { HealthController } from './health/health.controller';
import { InfraModule } from './infra/infra.module';
import { MeController } from './me/me.controller';
import { MeService } from './me/me.service';

@Module({})
export class AppModule implements NestModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [InfraModule, AuthModule],
      controllers: [
        HealthController,
        CatalogController,
        MeController,
        AdminController,
        CartController,
        CheckoutController,
        MeOrdersController,
        MeSupportController,
        AdminCommerceController,
        PublicContentController,
        AdminContentController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        CatalogService,
        MeService,
        AdminService,
        SettingsService,
        InventoryService,
        QuoteService,
        CartService,
        OrdersService,
        OrderEventsService,
        SupportService,
        VariantsAdminService,
        ContentService,
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
      ],
      exports: [APP_CONFIG],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
