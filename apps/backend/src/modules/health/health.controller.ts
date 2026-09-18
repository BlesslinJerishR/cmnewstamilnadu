import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OpenSearchService } from '../../infrastructure/opensearch/opensearch.service';
import { RedisService } from '../../infrastructure/redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly os: OpenSearchService,
  ) {}

  /** Liveness: the process is up. */
  @Get()
  @HttpCode(200)
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /**
   * Readiness: PostgreSQL is required. Redis and OpenSearch outages degrade the service
   * (no cache/rate-limit store, PostgreSQL search fallback) but do not make it unready.
   */
  @Get('ready')
  async ready(@Res() reply: FastifyReply) {
    const [postgres, redis, opensearch] = await Promise.all([this.db.ping(), this.redis.ping(), this.os.ping()]);
    const status = !postgres ? 'down' : redis && opensearch ? 'ok' : 'degraded';
    void reply.status(postgres ? 200 : 503).send({ status, checks: { postgres, redis, opensearch } });
  }
}
