import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { RedisService } from '../redis/redis.module';

const GENERATION_KEY = 'cache:generation';
const GENERATION_MEMO_MS = 2_000;
/** Cached payloads larger than this are not stored (protects Redis memory on a 4 GB VPS). */
const MAX_VALUE_BYTES = 256 * 1024;

/**
 * Response cache in Redis.
 * - Every key embeds a generation number. When new content becomes public the generation is
 *   bumped, which invalidates every feed/list/search entry at once without scanning keys.
 * - Every entry has a TTL, so stale generations simply expire.
 * - All failures are swallowed: if Redis is down the API serves directly from PostgreSQL
 *   and OpenSearch.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private memo: { value: string; at: number } | null = null;

  constructor(private readonly redis: RedisService) {}

  private async generation(): Promise<string> {
    if (this.memo && Date.now() - this.memo.at < GENERATION_MEMO_MS) return this.memo.value;
    const value = (await this.redis.cache.get(GENERATION_KEY)) ?? '0';
    this.memo = { value, at: Date.now() };
    return value;
  }

  async bumpGeneration(): Promise<void> {
    try {
      await this.redis.cache.incr(GENERATION_KEY);
      this.memo = null;
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${(err as Error).message}`);
    }
  }

  async wrap<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
    shouldCache: (value: T) => boolean = () => true,
  ): Promise<T> {
    let fullKey: string | null = null;
    if (this.redis.cacheAvailable) {
      try {
        fullKey = `cache:${await this.generation()}:${key}`;
        const hit = await this.redis.cache.get(fullKey);
        if (hit !== null) return JSON.parse(hit) as T;
      } catch {
        fullKey = null;
      }
    }
    const value = await producer();
    if (fullKey && shouldCache(value)) {
      try {
        const json = JSON.stringify(value);
        if (Buffer.byteLength(json) <= MAX_VALUE_BYTES) await this.redis.cache.set(fullKey, json, 'EX', ttlSeconds);
      } catch {
        // cache writes are best effort (e.g. Redis at maxmemory)
      }
    }
    return value;
  }
}

@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
