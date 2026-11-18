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
import { CatalogController } from './catalog/catalog.controller';
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
      controllers: [HealthController, CatalogController, MeController, AdminController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        CatalogService,
        MeService,
        AdminService,
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
