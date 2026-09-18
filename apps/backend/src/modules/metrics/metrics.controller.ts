import { Controller, Get, Headers, Inject, NotFoundException, Res, UnauthorizedException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly metrics: MetricsService,
  ) {}

  /** Disabled unless METRICS_TOKEN is set; requires `Authorization: Bearer <METRICS_TOKEN>`. */
  @Get()
  async scrape(@Headers('authorization') auth: string | undefined, @Res() reply: FastifyReply) {
    const token = this.config.METRICS_TOKEN;
    if (!token) throw new NotFoundException();
    const given = Buffer.from((auth ?? '').replace(/^Bearer\s+/i, ''));
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException();
    void reply.header('Content-Type', this.metrics.registry.contentType).send(await this.metrics.registry.metrics());
  }
}
