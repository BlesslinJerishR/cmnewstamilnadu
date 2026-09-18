import { Inject, Injectable, Logger } from '@nestjs/common';
import { statfs } from 'node:fs/promises';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OpenSearchService } from '../../infrastructure/opensearch/opensearch.service';
import { RedisService } from '../../infrastructure/redis/redis.module';
import { ArticleProcessorService } from '../processing/article-processor.service';

export const DISK_STATUS_KEY = 'system:disk-status';

export class DiskCriticalError extends Error {}

export interface DiskStatus {
  path: string;
  usedPercent: number;
  totalBytes: number;
  freeBytes: number;
  level: 'ok' | 'warn' | 'critical';
  checkedAt: string;
}

export async function readDiskUsage(path: string): Promise<Omit<DiskStatus, 'level' | 'checkedAt'>> {
  const s = await statfs(path);
  const total = s.blocks * s.bsize;
  const free = s.bavail * s.bsize;
  return { path, totalBytes: total, freeBytes: free, usedPercent: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0 };
}

/**
 * Retention and housekeeping. Only derived/diagnostic data is removed automatically:
 * accepted articles (metadata only) are kept; rejected and duplicate rows, raw provider
 * metadata, old run history and processed outbox rows expire.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly os: OpenSearchService,
    private readonly redis: RedisService,
    private readonly processor: ArticleProcessorService,
  ) {}

  async retention(): Promise<Record<string, number>> {
    const c = this.config;
    const run = async (sql: string, params: unknown[]) => (await this.db.query(`${sql} RETURNING 1`, params)).length;
    const result: Record<string, number> = {
      rejected: await run(
        `DELETE FROM articles WHERE status = 'rejected' AND manual_status IS NULL AND created_at < now() - make_interval(days => $1)
           AND NOT EXISTS (SELECT 1 FROM articles d WHERE d.duplicate_of_id = articles.id)`,
        [c.RETENTION_REJECTED_DAYS],
      ),
      duplicates: await run(
        `DELETE FROM articles WHERE status = 'duplicate' AND manual_status IS NULL AND created_at < now() - make_interval(days => $1)`,
        [c.RETENTION_DUPLICATE_DAYS],
      ),
      providerMetadata: await run(
        `UPDATE articles SET provider_metadata = NULL WHERE provider_metadata IS NOT NULL AND created_at < now() - make_interval(days => $1)`,
        [c.RETENTION_PROVIDER_METADATA_DAYS],
      ),
      outbox: await run(`DELETE FROM search_outbox WHERE processed_at < now() - interval '7 days'`, []),
      ingestionRuns: await run(`DELETE FROM ingestion_runs WHERE started_at < now() - make_interval(days => $1)`, [c.RETENTION_INGESTION_RUNS_DAYS]),
      backfillSlices: await run(
        `DELETE FROM backfill_slices s USING backfills b WHERE s.backfill_id = b.id AND b.status IN ('completed', 'cancelled')
           AND b.completed_at < now() - interval '30 days' AND s.status IN ('done', 'skipped')`,
        [],
      ),
      sessions: await run(`DELETE FROM sessions WHERE expires_at < now()`, []),
      deadLetters: await run(`DELETE FROM dead_letter_jobs WHERE resolved_at < now() - interval '30 days'`, []),
      auditLog: await run(`DELETE FROM admin_audit_log WHERE created_at < now() - interval '365 days'`, []),
    };
    if (c.OPENSEARCH_RETENTION_DAYS > 0) {
      try {
        const res = await this.os.client.deleteByQuery({
          index: this.os.alias,
          body: { query: { range: { published_at: { lt: `now-${c.OPENSEARCH_RETENTION_DAYS}d` } } } } as never,
          conflicts: 'proceed',
        });
        result.searchDocuments = Number((res.body as { deleted?: number }).deleted ?? 0);
      } catch (err) {
        this.logger.warn(`OpenSearch retention failed: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Retention: ${JSON.stringify(result)}`);
    return result;
  }

  async diskCheck(): Promise<DiskStatus> {
    const usage = await readDiskUsage(this.config.DISK_PATH);
    const level: DiskStatus['level'] =
      usage.usedPercent >= this.config.DISK_CRITICAL_PERCENT ? 'critical' : usage.usedPercent >= this.config.DISK_WARN_PERCENT ? 'warn' : 'ok';
    const status: DiskStatus = { ...usage, level, checkedAt: new Date().toISOString() };
    await this.redis.bullmq.set(DISK_STATUS_KEY, JSON.stringify(status), 'EX', 3600).catch(() => undefined);
    if (level === 'critical') {
      this.logger.error(`Disk ${usage.usedPercent}% used: backfills are paused and retention runs now`);
      await this.retention();
    } else if (level === 'warn') {
      this.logger.warn(`Disk ${usage.usedPercent}% used`);
    }
    return status;
  }

  async assertDiskNotCritical(): Promise<void> {
    const raw = await this.redis.bullmq.get(DISK_STATUS_KEY).catch(() => null);
    if (raw && (JSON.parse(raw) as DiskStatus).level === 'critical') {
      throw new DiskCriticalError('Disk usage is critical; backfill work is paused');
    }
  }

  /** Re-applies current rules to stored articles (optionally one source), in id batches. */
  async rescoreAll(sourceId?: number): Promise<{ processed: number; changed: number }> {
    let lastId = '0';
    let processed = 0;
    let changed = 0;
    for (;;) {
      const rows = await this.db.query<{ id: string }>(
        `SELECT id FROM articles WHERE id > $1 AND ($2::int IS NULL OR source_id = $2) ORDER BY id LIMIT 500`,
        [lastId, sourceId ?? null],
      );
      if (rows.length === 0) break;
      for (const r of rows) {
        const res = await this.processor.recompute(r.id);
        processed++;
        if (res?.changed) changed++;
      }
      lastId = rows[rows.length - 1].id;
    }
    await this.processor.triggerIndexing();
    this.logger.log(`Rescored ${processed} articles, ${changed} changed status`);
    return { processed, changed };
  }
}
