import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

/**
 * Two kinds of Redis connections:
 *  - `cache`: fails fast (no offline queue, short timeouts) so a Redis outage degrades
 *    caching and rate limiting instead of blocking API requests.
 *  - `bullmq`: the blocking-friendly connection BullMQ requires (maxRetriesPerRequest = null).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly cache: Redis;
  readonly bullmq: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.cache = new IORedis(config.REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 750,
      connectTimeout: 2000,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    this.bullmq = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    for (const [name, conn] of [['cache', this.cache], ['bullmq', this.bullmq]] as const) {
      conn.on('error', (err) => this.logger.warn(`Redis (${name}) error: ${err.message}`));
    }
  }

  get cacheAvailable(): boolean {
    return this.cache.status === 'ready';
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.cache.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.cache.quit(), this.bullmq.quit()]);
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
