import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env';

/** HTTP-level setup shared by main.ts and the integration tests. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const http = app.getHttpAdapter().getInstance() as {
    set: (k: string, v: unknown) => void;
    disable: (k: string) => void;
  };
  http.disable('x-powered-by');
  if (config.TRUST_PROXY) http.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Same-origin/server-to-server requests have no Origin header.
      if (!origin || config.CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-csrf-token',
      'x-request-id',
      'idempotency-key',
      'x-client',
      'x-realm',
    ],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });
  // Reject oversized JSON early; body-parser default limit is 100kb which is what we want.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
}

export function buildOpenApi(app: INestApplication) {
  const options = new DocumentBuilder()
    .setTitle('BizGo API')
    .setDescription(
      'Single-seller commerce API (Phase 1: auth, catalog read, RBAC). Generated from code; see docs/api.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('bg_sid', { type: 'apiKey', in: 'cookie', name: 'bg_sid' }, 'customerSession')
    .addCookieAuth(
      'bg_admin_sid',
      { type: 'apiKey', in: 'cookie', name: 'bg_admin_sid' },
      'adminSession',
    )
    .addCookieAuth(
      'bg_factory_sid',
      { type: 'apiKey', in: 'cookie', name: 'bg_factory_sid' },
      'factorySession',
    )
    .build();
  return SwaggerModule.createDocument(app, options);
}

export function mountSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApi(app));
}
