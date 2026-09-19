import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';
import { createLogger, migrate } from './bootstrap';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadConfig } from './config/app-config';
import { RedisService } from './infrastructure/redis/redis.module';
import { MetricsService } from './modules/metrics/metrics.service';
import { NichesService } from './modules/niches/niches.service';

const SLOW_REQUEST_MS = 1000;

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  await migrate(config);

  const adapter = new FastifyAdapter({
    trustProxy: config.TRUST_PROXY === 'false' ? false : config.TRUST_PROXY.split(',').map((s) => s.trim()).filter(Boolean),
    bodyLimit: 64 * 1024,
    routerOptions: { maxParamLength: 200 },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: createLogger(config),
  });
  await app.get(NichesService).seed();

  const fastify = app.getHttpAdapter().getInstance();
  await app.register(helmet as never, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } } as never);

  const redis = app.get(RedisService);
  await app.register(rateLimit as never, {
    global: true,
    redis: redis.cache,
    skipOnError: true,
    nameSpace: 'ratelimit:',
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    max: (req: { url: string }) => (req.url.startsWith('/api/v1/auth/') ? config.AUTH_RATE_LIMIT_MAX : config.RATE_LIMIT_MAX),
    keyGenerator: (req: { url: string; ip: string }) => `${req.url.startsWith('/api/v1/auth/') ? 'auth' : 'api'}:${req.ip}`,
    allowList: (req: { url: string }) => req.url.startsWith('/health'),
  } as never);

  const metrics = app.get(MetricsService);
  const httpLogger = new Logger('Http');
  fastify.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? 'unmatched';
    metrics.httpDuration.labels(request.method, route, String(reply.statusCode)).observe(reply.elapsedTime / 1000);
    // Route pattern only (no query string): enough to find slow endpoints without logging user input.
    if (reply.elapsedTime > SLOW_REQUEST_MS) {
      httpLogger.warn(`Slow request ${request.method} ${route} ${reply.statusCode} ${Math.round(reply.elapsedTime)}ms`);
    }
    done();
  });

  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  // Native mobile apps do not need CORS. Browsers are only allowed from configured origins.
  app.enableCors({ origin: origins.length ? origins : false, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], maxAge: 600 });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready', 'metrics'] });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(config.PORT, config.HOST);
  new Logger('Bootstrap').log(`API listening on ${config.HOST}:${config.PORT}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('API failed to start', err);
  process.exit(1);
});
