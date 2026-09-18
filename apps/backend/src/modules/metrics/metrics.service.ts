import { Inject, Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OpenSearchService } from '../../infrastructure/opensearch/opensearch.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { RedisService } from '../../infrastructure/redis/redis.module';
import { readDiskUsage } from '../maintenance/maintenance.service';

/**
 * Prometheus-format metrics. Pipeline gauges are computed from PostgreSQL, Redis and
 * OpenSearch at scrape time so the API process can report on the worker without extra
 * infrastructure. Scrape every 60s or slower.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpDuration: Histogram<string>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly os: OpenSearchService,
    private readonly queues: QueueService,
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: 'cmnews_api_' });
    this.httpDuration = new Histogram({
      name: 'cmnews_http_request_duration_seconds',
      help: 'HTTP request latency',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    const self = this;
    new Gauge({
      name: 'cmnews_articles',
      help: 'Stored articles by status',
      labelNames: ['status'],
      registers: [this.registry],
      async collect() {
        const rows = await self.db.query<{ status: string; n: string }>('SELECT status, count(*) AS n FROM articles GROUP BY status').catch(() => []);
        this.reset();
        for (const r of rows) this.set({ status: r.status }, Number(r.n));
      },
    });
    new Gauge({
      name: 'cmnews_ingestion_runs_24h',
      help: 'Ingestion runs in the last 24h by provider and status',
      labelNames: ['provider', 'status'],
      registers: [this.registry],
      async collect() {
        const rows = await self.db
          .query<{ provider: string; status: string; n: string }>(
            `SELECT provider, status, count(*) AS n FROM ingestion_runs WHERE started_at > now() - interval '24 hours' GROUP BY 1, 2`,
          )
          .catch(() => []);
        this.reset();
        for (const r of rows) this.set({ provider: r.provider, status: r.status }, Number(r.n));
      },
    });
    new Gauge({
      name: 'cmnews_ingestion_outcomes_24h',
      help: 'Article outcomes from ingestion in the last 24h (duplicate and rejection rates)',
      labelNames: ['outcome'],
      registers: [this.registry],
      async collect() {
        const [r] = await self.db
          .query<Record<string, string>>(
            `SELECT coalesce(sum(fetched),0) AS fetched, coalesce(sum(accepted),0) AS accepted, coalesce(sum(pending),0) AS pending,
                    coalesce(sum(rejected),0) AS rejected, coalesce(sum(duplicates),0) AS duplicates, coalesce(sum(existing),0) AS existing,
                    coalesce(sum(invalid),0) AS invalid
               FROM ingestion_runs WHERE started_at > now() - interval '24 hours'`,
          )
          .catch(() => [{} as Record<string, string>]);
        this.reset();
        for (const [k, v] of Object.entries(r ?? {})) this.set({ outcome: k }, Number(v));
      },
    });
    new Gauge({
      name: 'cmnews_last_successful_scheduled_ingestion_age_seconds',
      help: 'Seconds since the last successful scheduled GDELT fetch',
      registers: [this.registry],
      async collect() {
        const [r] = await self.db
          .query<{ age: number | null }>(
            `SELECT extract(epoch FROM now() - max(finished_at))::float8 AS age FROM ingestion_runs WHERE status = 'succeeded' AND kind = 'scheduled'`,
          )
          .catch(() => [{ age: null }]);
        this.set(r?.age ?? -1);
      },
    });
    new Gauge({
      name: 'cmnews_search_outbox',
      help: 'Search outbox rows waiting (pending) or given up (failed)',
      labelNames: ['state'],
      registers: [this.registry],
      async collect() {
        const [r] = await self.db
          .query<{ pending: string; failed: string }>(
            `SELECT count(*) FILTER (WHERE attempts < 10) AS pending, count(*) FILTER (WHERE attempts >= 10) AS failed
               FROM search_outbox WHERE processed_at IS NULL`,
          )
          .catch(() => [{ pending: '0', failed: '0' }]);
        this.set({ state: 'pending' }, Number(r.pending));
        this.set({ state: 'failed' }, Number(r.failed));
      },
    });
    new Gauge({
      name: 'cmnews_queue_jobs',
      help: 'BullMQ jobs by queue and state',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
      async collect() {
        this.reset();
        for (const q of self.queues.all()) {
          try {
            const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'prioritized', 'failed');
            for (const [state, n] of Object.entries(counts)) this.set({ queue: q.name, state }, n);
          } catch {
            // Redis down: leave the queue out of this scrape
          }
        }
      },
    });
    new Gauge({
      name: 'cmnews_redis_used_memory_bytes',
      help: 'Redis used memory',
      registers: [this.registry],
      async collect() {
        const info = await self.redis.cache.info('memory').catch(() => '');
        const m = /used_memory:(\d+)/.exec(info);
        this.set(m ? Number(m[1]) : -1);
      },
    });
    new Gauge({
      name: 'cmnews_postgres_database_bytes',
      help: 'PostgreSQL database size',
      registers: [this.registry],
      async collect() {
        const [r] = await self.db.query<{ size: string }>('SELECT pg_database_size(current_database()) AS size').catch(() => [{ size: '-1' }]);
        this.set(Number(r.size));
      },
    });
    new Gauge({
      name: 'cmnews_postgres_connections',
      help: 'PostgreSQL connections to this database',
      registers: [this.registry],
      async collect() {
        const [r] = await self.db
          .query<{ n: string }>('SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database()')
          .catch(() => [{ n: '-1' }]);
        this.set(Number(r.n));
      },
    });
    new Gauge({
      name: 'cmnews_opensearch',
      help: 'OpenSearch node stats (up, heap used percent, heap used bytes, disk used percent, documents)',
      labelNames: ['stat'],
      registers: [this.registry],
      async collect() {
        this.reset();
        try {
          const res = await self.os.client.nodes.stats({ metric: ['jvm', 'fs', 'indices'] as never });
          const node = Object.values((res.body as { nodes: Record<string, any> }).nodes)[0];
          this.set({ stat: 'up' }, 1);
          this.set({ stat: 'heap_used_percent' }, node?.jvm?.mem?.heap_used_percent ?? -1);
          this.set({ stat: 'heap_used_bytes' }, node?.jvm?.mem?.heap_used_in_bytes ?? -1);
          const total = node?.fs?.total?.total_in_bytes ?? 0;
          const avail = node?.fs?.total?.available_in_bytes ?? 0;
          this.set({ stat: 'disk_used_percent' }, total ? Math.round(((total - avail) / total) * 1000) / 10 : -1);
          this.set({ stat: 'documents' }, node?.indices?.docs?.count ?? -1);
          this.set({ stat: 'store_bytes' }, node?.indices?.store?.size_in_bytes ?? -1);
        } catch {
          this.set({ stat: 'up' }, 0);
        }
      },
    });
    new Gauge({
      name: 'cmnews_disk_used_percent',
      help: 'Filesystem usage of DISK_PATH as seen by the API container',
      registers: [this.registry],
      async collect() {
        const d = await readDiskUsage(self.config.DISK_PATH).catch(() => null);
        this.set(d ? d.usedPercent : -1);
      },
    });
  }
}
