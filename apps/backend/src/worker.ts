import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { logLevels, migrate } from './bootstrap';
import { loadConfig } from './config/app-config';
import { WorkerModule } from './worker/worker.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  await migrate(config);
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: logLevels(config.LOG_LEVEL) });
  app.enableShutdownHooks();
  new Logger('Worker').log('Worker started');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker failed to start', err);
  process.exit(1);
});
