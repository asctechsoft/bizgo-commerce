import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, mountSwagger } from './bootstrap';
import { loadConfig } from './config/env';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.forRoot(config), {
    logger: config.isProduction ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });
  configureApp(app, config);
  if (config.SWAGGER_ENABLED && !config.isProduction) mountSwagger(app);
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`BizGo API listening on :${config.PORT} (${config.APP_ENV})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
