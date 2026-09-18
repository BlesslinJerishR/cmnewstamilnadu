import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';
import { logLevels, migrate } from './bootstrap';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadConfig } from './config/app-config';
import { RedisService } from './infrastructure/redis/redis.module';
import { MetricsService } from './modules/metrics/metrics.service';
import { NichesService } from './modules/niches/niches.service';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  await migrate(config);

  const adapter = new FastifyAdapter({
    trustProxy: config.TRUST_PROXY_HOPS > 0 ? config.TRUST_PROXY_HOPS : false,
    bodyLimit: 64 * 1024,
    maxParamLength: 200,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: logLevels(config.LOG_LEVEL),
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
  fastify.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? 'unmatched';
    metrics.httpDuration.labels(request.method, route, String(reply.statusCode)).observe(reply.elapsedTime / 1000);
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
