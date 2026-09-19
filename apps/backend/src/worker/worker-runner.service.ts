import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Job, UnrecoverableError, Worker } from 'bullmq';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DatabaseService } from '../infrastructure/database/database.service';
import { JOBS, QUEUES, QueueName } from '../infrastructure/queue/queue.constants';
import { QueueService } from '../infrastructure/queue/queue.service';
import { RedisService } from '../infrastructure/redis/redis.module';
import { GdeltQueryRejectedError, GdeltRateLimitedError } from '../modules/gdelt/gdelt-doc.client';
import { IndexingService } from '../modules/indexing/indexing.service';
import { DocWindowJob, GkgSlotJob, IngestionService, ProcessBatchJob } from '../modules/ingestion/ingestion.service';
import { MaintenanceService } from '../modules/maintenance/maintenance.service';
import { NichesService } from '../modules/niches/niches.service';
import { ArticleProcessorService } from '../modules/processing/article-processor.service';

type Handler = (job: Job, worker: Worker) => Promise<unknown>;

/**
 * Runs the BullMQ workers and registers the repeatable schedules.
 *
 * Concurrency is deliberately low for a 2 vCPU VPS:
 *  - ingestion: DOC API calls, serialised by a Redis slot to respect GDELT's request policy
 *  - archive: GKG file downloads for backfills (GDELT_GKG_CONCURRENCY, default 2)
 *  - processing: 1, so deduplication decisions never race each other
 *  - indexing: 1, so the outbox relay and reindex never interleave
 *  - maintenance: 1
 */
@Injectable()
export class WorkerRunnerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRunnerService.name);
  private readonly workers: Worker[] = [];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly redis: RedisService,
    private readonly db: DatabaseService,
    private readonly queues: QueueService,
    private readonly ingestion: IngestionService,
    private readonly processor: ArticleProcessorService,
    private readonly indexing: IndexingService,
    private readonly maintenance: MaintenanceService,
    private readonly niches: NichesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Seed before any job runs so the first cycle and the initial backfill find the niche.
    await this.niches.seed();
    // Two slots: the periodic cycle job plus one DOC fetch (DOC calls are serialised anyway).
    this.start(QUEUES.INGESTION, 2, {
      [JOBS.INGEST_CYCLE]: async () => ({ enqueued: await this.ingestion.enqueueCycle('scheduled') }),
      [JOBS.FETCH_DOC_WINDOW]: async (job, worker) => {
        const data = job.data as DocWindowJob;
        if (data.sliceId) {
          await this.maintenance.assertDiskNotCritical();
          await this.ingestion.markSliceRunning(data.sliceId);
        }
        try {
          return await this.ingestion.runDocWindow(data);
        } catch (err) {
          // A query GDELT refuses (syntax, phrase too short) will never succeed on retry.
          if (err instanceof GdeltQueryRejectedError) throw new UnrecoverableError(err.message);
          if (err instanceof GdeltRateLimitedError) {
            // Pause the whole DOC queue until GDELT's cooldown ends. The job goes back to the
            // queue without using an attempt, and no worker sits blocked while waiting.
            await worker.rateLimit(err.retryAfterMs);
            throw Worker.RateLimitError();
          }
          throw err;
        }
      },
    });
    this.start(QUEUES.ARCHIVE, this.config.GDELT_GKG_CONCURRENCY, {
      [JOBS.FETCH_GKG_FILE]: async (job) => {
        const data = job.data as GkgSlotJob;
        await this.maintenance.assertDiskNotCritical();
        await this.ingestion.markSliceRunning(data.sliceId);
        return this.ingestion.runGkgSlot(data);
      },
    });
    this.start(QUEUES.PROCESSING, 1, {
      [JOBS.PROCESS_BATCH]: async (job) => {
        const data = job.data as ProcessBatchJob;
        const counts = await this.processor.processBatch(data.nicheId, data.candidates);
        await this.ingestion.recordBatchCounts(data.runId, counts);
        return counts;
      },
    });
    this.start(QUEUES.INDEXING, 1, {
      [JOBS.OUTBOX_RELAY]: () => this.indexing.relayOutbox(),
      [JOBS.REINDEX_ALL]: () => this.indexing.reindexAll(),
    });
    this.start(QUEUES.MAINTENANCE, 1, {
      [JOBS.RETENTION]: () => this.maintenance.retention(),
      [JOBS.DISK_CHECK]: () => this.maintenance.diskCheck(),
      [JOBS.RESCORE_ALL]: (job) => this.maintenance.rescoreAll((job.data as { sourceId?: number }).sourceId),
      [JOBS.RESUME_BACKFILLS]: () => this.ingestion.resumeFailedSlices(),
    });

    await this.registerSchedules();
    void this.startupTasks();
  }

  private start(queue: QueueName, concurrency: number, handlers: Record<string, Handler>): void {
    const worker: Worker = new Worker(
      queue,
      async (job) => {
        const handler = handlers[job.name];
        if (!handler) throw new UnrecoverableError(`No handler for job ${job.name} on ${queue}`);
        return handler(job, worker);
      },
      {
        connection: this.redis.bullmq,
        concurrency,
        lockDuration: 120_000,
        stalledInterval: 60_000,
        maxStalledCount: 2,
      },
    );
    worker.on('failed', (job, err) => void this.onFailed(queue, job, err));
    worker.on('error', (err) => this.logger.error(`Worker ${queue} error: ${err.message}`));
    this.workers.push(worker);
  }

  /** Jobs that exhausted their retries go to the dead letter table for inspection/retry. */
  private async onFailed(queue: string, job: Job | undefined, err: Error): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    const final = err instanceof UnrecoverableError || err.name === 'UnrecoverableError' || job.attemptsMade >= attempts;
    this.logger.warn(`Job ${queue}/${job.name}#${job.id} failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`);
    // Periodic self-healing jobs (relay every 30s, disk check) are not dead-lettered: the next
    // tick retries them, and their failures are visible in logs and metrics.
    if (!final || job.name === JOBS.OUTBOX_RELAY || job.name === JOBS.DISK_CHECK || job.name === JOBS.RESUME_BACKFILLS) return;
    try {
      await this.db.query(
        'INSERT INTO dead_letter_jobs (queue, job_name, job_id, data, failed_reason, attempts) VALUES ($1, $2, $3, $4, $5, $6)',
        [queue, job.name, job.id ?? null, JSON.stringify(job.data ?? {}), err.message.slice(0, 2000), job.attemptsMade],
      );
      const sliceId = (job.data as { sliceId?: string }).sliceId;
      if (sliceId) await this.ingestion.finishSlice(sliceId, 'failed', 0, 0, err.message.slice(0, 1000));
    } catch (e) {
      this.logger.error(`Could not record dead letter: ${(e as Error).message}`);
    }
  }

  private async registerSchedules(): Promise<void> {
    const ingestion = this.queues.get(QUEUES.INGESTION);
    if (this.config.INGEST_ENABLED) {
      await ingestion.upsertJobScheduler(
        'gdelt-ingest-cycle',
        { every: this.config.INGEST_INTERVAL_MINUTES * 60 * 1000 },
        { name: JOBS.INGEST_CYCLE, data: {}, opts: { priority: 1, attempts: 3, removeOnComplete: 50, removeOnFail: 50 } },
      );
      this.logger.log(`GDELT ingestion scheduled every ${this.config.INGEST_INTERVAL_MINUTES} minutes`);
    } else {
      await ingestion.removeJobScheduler('gdelt-ingest-cycle');
      this.logger.warn('Scheduled ingestion is disabled (INGEST_ENABLED=false)');
    }
    await this.queues.get(QUEUES.INDEXING).upsertJobScheduler(
      'outbox-relay',
      { every: 30_000 },
      { name: JOBS.OUTBOX_RELAY, data: {}, opts: { attempts: 1, removeOnComplete: true, removeOnFail: 20 } },
    );
    const maintenance = this.queues.get(QUEUES.MAINTENANCE);
    // 03:00 IST (21:30 UTC): the quietest time for Indian readers.
    await maintenance.upsertJobScheduler(
      'daily-retention',
      { pattern: '30 21 * * *', tz: 'UTC' },
      { name: JOBS.RETENTION, data: {}, opts: { attempts: 3, removeOnComplete: 10, removeOnFail: 10 } },
    );
    await maintenance.upsertJobScheduler(
      'resume-backfills',
      { every: 30 * 60 * 1000 },
      { name: JOBS.RESUME_BACKFILLS, data: {}, opts: { attempts: 1, removeOnComplete: 10, removeOnFail: 10 } },
    );
    await maintenance.upsertJobScheduler(
      'disk-check',
      { every: 10 * 60 * 1000 },
      { name: JOBS.DISK_CHECK, data: {}, opts: { attempts: 1, removeOnComplete: 5, removeOnFail: 5 } },
    );
  }

  private async startupTasks(): Promise<void> {
    await this.maintenance.diskCheck().catch((err: Error) => this.logger.warn(`Initial disk check failed: ${err.message}`));
    // The relay job (not this bootstrap code) checks the search alias and rebuilds the index
    // from PostgreSQL if it is missing; running it through the queue keeps it serialised with
    // other indexing work. If OpenSearch is still starting, the 30s schedule retries.
    await this.queues
      .add(QUEUES.INDEXING, JOBS.OUTBOX_RELAY, {}, { deduplication: { id: 'outbox-relay' }, attempts: 1, removeOnComplete: true, removeOnFail: 20 })
      .catch((err: Error) => this.logger.warn(`Could not enqueue startup relay: ${err.message}`));
    await this.ingestion
      .ensureInitialBackfill()
      .catch((err: Error) => this.logger.error(`Initial backfill setup failed: ${err.message}`));
    if (this.config.INGEST_ENABLED) {
      await this.ingestion.enqueueCycle('scheduled').catch((err: Error) => this.logger.warn(`Initial ingestion cycle failed: ${err.message}`));
    }
  }

  /**
   * Nest destroys the root (worker) module before the global database/Redis modules, so closing
   * here lets in-flight jobs finish while their connections are still open.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Stopping workers (waiting for active jobs)…');
    await Promise.allSettled(this.workers.map((w) => w.close()));
  }
}
