import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { JOBS, QUEUES } from '../../infrastructure/queue/queue.constants';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { GdeltDocClient, GdeltRateLimitedError } from '../gdelt/gdelt-doc.client';
import { alignToGkgSlot, GdeltGkgClient, GKG_SLOT_MINUTES } from '../gdelt/gdelt-gkg.client';
import { NichesService } from '../niches/niches.service';
import { RawCandidate } from '../processing/candidate';

export type IngestionKind = 'scheduled' | 'backfill' | 'manual';
export type BackfillStrategy = 'auto' | 'doc' | 'gkg';

export interface DocWindowJob {
  nicheId: number;
  queryId: number;
  start: string;
  end: string;
  kind: IngestionKind;
  sliceId?: string;
}

export interface GkgSlotJob {
  nicheId: number;
  sliceId: string;
  slotStart: string;
}

export interface ProcessBatchJob {
  nicheId: number;
  runId: string | null;
  candidates: RawCandidate[];
}

interface QueryRow {
  id: number;
  niche_id: number;
  name: string;
  query_text: string;
  source_language: string;
  priority: number;
  window_minutes: number;
  max_results: number;
}

/** Scheduled jobs outrank backfill jobs in the same queue (lower number = higher priority). */
export const PRIORITY_SCHEDULED = 1;
export const PRIORITY_MANUAL = 2;
export const PRIORITY_BACKFILL = 10;
const PROCESS_CHUNK_SIZE = 100;
/** A slice is retried (across job retries and periodic resumes) at most this many times. */
export const MAX_SLICE_ATTEMPTS = 40;
const DAY_MS = 24 * 3600 * 1000;
/** Calendar dates given to the backfill are interpreted in Indian Standard Time. */
export const IST_OFFSET = '+05:30';

export function parseDayBoundary(value: string, edge: 'start' | 'end'): Date {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}${IST_OFFSET}`)
    : new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date "${value}"`);
  return d;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly queues: QueueService,
    private readonly niches: NichesService,
    private readonly doc: GdeltDocClient,
    private readonly gkg: GdeltGkgClient,
  ) {}

  /** Periodic cycle: one overlapping-window fetch job per enabled query of every enabled niche. */
  async enqueueCycle(kind: IngestionKind = 'scheduled'): Promise<number> {
    const queries = await this.db.query<QueryRow>(
      `SELECT q.* FROM gdelt_queries q JOIN niches n ON n.id = q.niche_id
        WHERE q.enabled AND n.enabled ORDER BY q.priority, q.id`,
    );
    const now = new Date();
    const intervalMs = this.config.INGEST_INTERVAL_MINUTES * 60 * 1000;
    const bucket = Math.floor(now.getTime() / intervalMs);
    for (const q of queries) {
      // The window is deliberately longer than the schedule interval (default 180 vs 30 minutes),
      // so an article GDELT indexes late, or a failed/missed run, is still picked up next time.
      const windowMs = Math.max(q.window_minutes * 60 * 1000, intervalMs);
      const job: DocWindowJob = {
        nicheId: q.niche_id,
        queryId: q.id,
        start: new Date(now.getTime() - windowMs).toISOString(),
        end: now.toISOString(),
        kind,
      };
      await this.queues.add(QUEUES.INGESTION, JOBS.FETCH_DOC_WINDOW, job, {
        jobId: kind === 'scheduled' ? `doc-${q.id}-${bucket}` : undefined,
        priority: kind === 'scheduled' ? PRIORITY_SCHEDULED : PRIORITY_MANUAL,
      });
    }
    return queries.length;
  }

  async runDocWindow(job: DocWindowJob): Promise<{ runId: string; fetched: number }> {
    const q = await this.db.one<QueryRow>('SELECT * FROM gdelt_queries WHERE id = $1', [job.queryId]);
    if (!q) {
      this.logger.warn(`Query ${job.queryId} no longer exists; skipping`);
      if (job.sliceId) await this.finishSlice(job.sliceId, 'skipped', 0, 0, 'query deleted');
      return { runId: '0', fetched: 0 };
    }
    const start = new Date(job.start);
    const end = new Date(job.end);
    const run = await this.startRun(q.niche_id, q.id, job.kind, 'gdelt-doc', start, end);
    await this.db.query('UPDATE gdelt_queries SET last_run_at = now() WHERE id = $1', [q.id]);
    try {
      const result = await this.doc.fetchWindow(
        { queryId: q.id, queryText: q.query_text, sourceLanguage: q.source_language, maxResults: q.max_results },
        start,
        end,
      );
      await this.enqueueProcessing(q.niche_id, run, result.candidates, job.kind === 'backfill');
      await this.db.query(
        `UPDATE ingestion_runs SET status = 'succeeded', fetched = $2, invalid = invalid + $3, finished_at = now(),
                duration_ms = (extract(epoch FROM now() - started_at) * 1000)::int,
                error = CASE WHEN $4::int > 0 THEN $4::int::text || ' window(s) hit the GDELT record cap' ELSE NULL END
          WHERE id = $1`,
        [run, result.candidates.length, result.skippedItems, result.truncatedWindows],
      );
      await this.db.query('UPDATE gdelt_queries SET last_success_at = now(), last_error = NULL WHERE id = $1', [q.id]);
      if (job.sliceId) await this.finishSlice(job.sliceId, 'done', result.candidates.length, result.candidates.length, null);
      return { runId: run, fetched: result.candidates.length };
    } catch (err) {
      if (err instanceof GdeltRateLimitedError) {
        // Not a failure: the window is retried after the cooldown. Keep run history meaningful.
        await this.db.query('DELETE FROM ingestion_runs WHERE id = $1', [run]);
        if (job.sliceId) await this.db.query(`UPDATE backfill_slices SET status = 'pending', attempts = GREATEST(attempts - 1, 0) WHERE id = $1`, [job.sliceId]);
        throw err;
      }
      const message = (err as Error).message.slice(0, 1000);
      await this.failRun(run, message);
      await this.db.query('UPDATE gdelt_queries SET last_error = $2 WHERE id = $1', [q.id, message]);
      throw err;
    }
  }

  async runGkgSlot(job: GkgSlotJob): Promise<{ lines: number; matched: number }> {
    const niche = await this.niches.getById(job.nicheId);
    const anchor = this.niches.relevanceConfig(niche).anchorPattern || '\\bvijay\\b';
    const slotStart = new Date(job.slotStart);
    const slotEnd = new Date(slotStart.getTime() + GKG_SLOT_MINUTES * 60 * 1000);
    const run = await this.startRun(job.nicheId, null, 'backfill', 'gdelt-gkg', slotStart, slotEnd);
    try {
      const result = await this.gkg.fetchSlot(slotStart, anchor);
      await this.enqueueProcessing(job.nicheId, run, result.candidates, true);
      await this.db.query(
        `UPDATE ingestion_runs SET status = 'succeeded', fetched = $2, finished_at = now(),
                duration_ms = (extract(epoch FROM now() - started_at) * 1000)::int,
                error = CASE WHEN $3::boolean THEN NULL ELSE 'GKG file not published for this slot' END
          WHERE id = $1`,
        [run, result.candidates.length, result.found],
      );
      await this.finishSlice(job.sliceId, result.found ? 'done' : 'skipped', result.lines, result.candidates.length, null);
      return { lines: result.lines, matched: result.candidates.length };
    } catch (err) {
      await this.failRun(run, (err as Error).message.slice(0, 1000));
      throw err;
    }
  }

  private async startRun(
    nicheId: number,
    queryId: number | null,
    kind: IngestionKind,
    provider: string,
    start: Date,
    end: Date,
  ): Promise<string> {
    const [row] = await this.db.query<{ id: string }>(
      `INSERT INTO ingestion_runs (niche_id, query_id, kind, provider, window_start, window_end)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nicheId, queryId, kind, provider, start.toISOString(), end.toISOString()],
    );
    return row.id;
  }

  private async failRun(runId: string, message: string): Promise<void> {
    await this.db.query(
      `UPDATE ingestion_runs SET status = 'failed', error = $2, finished_at = now(),
              duration_ms = (extract(epoch FROM now() - started_at) * 1000)::int
        WHERE id = $1`,
      [runId, message],
    );
  }

  private async enqueueProcessing(nicheId: number, runId: string, candidates: RawCandidate[], backfill: boolean): Promise<void> {
    for (let i = 0; i < candidates.length; i += PROCESS_CHUNK_SIZE) {
      const data: ProcessBatchJob = { nicheId, runId, candidates: candidates.slice(i, i + PROCESS_CHUNK_SIZE) };
      await this.queues.add(QUEUES.PROCESSING, JOBS.PROCESS_BATCH, data, {
        priority: backfill ? PRIORITY_BACKFILL : PRIORITY_SCHEDULED,
        // Batches carry up to 100 raw candidates; outcomes are already recorded in ingestion_runs,
        // so keep only a short history in Redis (192 MB budget on the VPS).
        removeOnComplete: { age: 3600, count: 20 },
        removeOnFail: { age: 3 * 24 * 3600, count: 50 },
      });
    }
  }

  async recordBatchCounts(
    runId: string | null,
    counts: { accepted: number; pending: number; rejected: number; duplicates: number; existing: number; invalid: number },
  ): Promise<void> {
    if (!runId) return;
    await this.db.query(
      `UPDATE ingestion_runs SET accepted = accepted + $2, pending = pending + $3, rejected = rejected + $4,
              duplicates = duplicates + $5, existing = existing + $6, invalid = invalid + $7
        WHERE id = $1`,
      [runId, counts.accepted, counts.pending, counts.rejected, counts.duplicates, counts.existing, counts.invalid],
    );
  }

  // ---------------------------------------------------------------- backfill

  /**
   * Creates a resumable backfill. The range is split into slices stored in PostgreSQL:
   *  - GKG archive slices (one per 15-minute file): the complete English-language record,
   *    not rate limited, so they cover the whole range with strategy "auto" or "gkg"
   *  - DOC API slices (one per query per day) for dates inside the DOC API search window:
   *    best-effort extra recall (full-text query matches), subject to GDELT's rate limit
   * Every slice is an idempotent job, so a backfill can be resumed at any time and the two
   * sources can overlap freely: deduplication merges them.
   */
  async createBackfill(nicheSlug: string, from: Date, to: Date, strategy: BackfillStrategy): Promise<{ id: number; slices: number }> {
    const niche = await this.niches.getBySlug(nicheSlug);
    const now = new Date();
    const end = new Date(Math.min(to.getTime(), now.getTime()));
    if (!(from < end)) throw new BadRequestException('Backfill range is empty or in the future');

    const docLimit = new Date(now.getTime() - this.config.GDELT_DOC_MAX_LOOKBACK_DAYS * DAY_MS);
    const docFrom = strategy === 'doc' ? from : strategy === 'gkg' ? end : new Date(Math.max(from.getTime(), docLimit.getTime()));
    const gkgTo = strategy === 'doc' ? from : end;

    const queries = await this.db.query<{ id: number }>(
      'SELECT id FROM gdelt_queries WHERE niche_id = $1 AND enabled ORDER BY priority, id',
      [niche.id],
    );

    const backfillId = await this.db.transaction(async (tx) => {
      const [bf] = await tx.query<{ id: number }>(
        `INSERT INTO backfills (niche_id, range_start, range_end, strategy) VALUES ($1, $2, $3, $4) RETURNING id`,
        [niche.id, from.toISOString(), end.toISOString(), strategy],
      );
      const provider: string[] = [];
      const queryIds: Array<number | null> = [];
      const starts: string[] = [];
      const ends: string[] = [];

      if (from < gkgTo) {
        const step = GKG_SLOT_MINUTES * 60 * 1000;
        for (let t = alignToGkgSlot(from).getTime(); t < gkgTo.getTime(); t += step) {
          provider.push('gdelt-gkg');
          queryIds.push(null);
          starts.push(new Date(t).toISOString());
          ends.push(new Date(t + step).toISOString());
        }
      }
      if (docFrom < end) {
        for (let t = docFrom.getTime(); t < end.getTime(); t += DAY_MS) {
          const sliceEnd = Math.min(t + DAY_MS, end.getTime());
          for (const q of queries) {
            provider.push('gdelt-doc');
            queryIds.push(q.id);
            starts.push(new Date(t).toISOString());
            ends.push(new Date(sliceEnd).toISOString());
          }
        }
      }
      await tx.query(
        `INSERT INTO backfill_slices (backfill_id, provider, query_id, slice_start, slice_end)
         SELECT $1, p, q, s, e FROM unnest($2::text[], $3::int[], $4::timestamptz[], $5::timestamptz[]) AS t(p, q, s, e)`,
        [bf.id, provider, queryIds, starts, ends],
      );
      await tx.query('UPDATE backfills SET total_slices = $2 WHERE id = $1', [bf.id, provider.length]);
      return bf.id;
    });
    const dispatched = await this.dispatchBackfill(backfillId);
    this.logger.log(`Backfill ${backfillId} created for ${from.toISOString()} → ${end.toISOString()} (${dispatched} slices)`);
    return { id: backfillId, slices: dispatched };
  }

  /** (Re)enqueues every unfinished slice. Safe to call repeatedly: job ids are slice ids. */
  async dispatchBackfill(backfillId: number, includeFailed = true): Promise<number> {
    const bf = await this.db.one<{ id: number; niche_id: number; status: string }>('SELECT id, niche_id, status FROM backfills WHERE id = $1', [backfillId]);
    if (!bf) throw new BadRequestException(`Unknown backfill ${backfillId}`);
    if (bf.status === 'cancelled') return 0;
    const statuses = includeFailed ? ['pending', 'running', 'failed'] : ['pending', 'running'];
    const slices = await this.db.query<{ id: string; provider: string; query_id: number | null; slice_start: Date; slice_end: Date; status: string }>(
      `SELECT id, provider, query_id, slice_start, slice_end, status FROM backfill_slices
        WHERE backfill_id = $1 AND status = ANY($2::text[]) ORDER BY slice_start DESC, id`,
      [backfillId, statuses],
    );
    const docQueue = this.queues.get(QUEUES.INGESTION);
    const archiveQueue = this.queues.get(QUEUES.ARCHIVE);
    if (includeFailed) {
      // A failed job keeps its id in BullMQ's failed set; remove it so the slice can be re-added.
      for (const s of slices) {
        if (s.status === 'failed') await (s.provider === 'gdelt-gkg' ? archiveQueue : docQueue).remove(`bf-slice-${s.id}`).catch(() => 0);
      }
      await this.db.query(`UPDATE backfill_slices SET status = 'pending', error = NULL, updated_at = now() WHERE backfill_id = $1 AND status = 'failed'`, [backfillId]);
      await this.db.query(`UPDATE backfills SET status = 'running', completed_at = NULL WHERE id = $1`, [backfillId]);
    }
    const gkgJobs = slices
      .filter((s) => s.provider === 'gdelt-gkg')
      .map((s) => ({
        name: JOBS.FETCH_GKG_FILE,
        data: { nicheId: bf.niche_id, sliceId: s.id, slotStart: new Date(s.slice_start).toISOString() } satisfies GkgSlotJob,
        opts: { jobId: `bf-slice-${s.id}`, priority: PRIORITY_BACKFILL },
      }));
    const docJobs = slices
      .filter((s) => s.provider === 'gdelt-doc')
      .map((s) => ({
        name: JOBS.FETCH_DOC_WINDOW,
        data: {
          nicheId: bf.niche_id,
          queryId: s.query_id!,
          start: new Date(s.slice_start).toISOString(),
          end: new Date(s.slice_end).toISOString(),
          kind: 'backfill',
          sliceId: s.id,
        } satisfies DocWindowJob,
        opts: { jobId: `bf-slice-${s.id}`, priority: PRIORITY_BACKFILL, attempts: 8 },
      }));
    for (let i = 0; i < gkgJobs.length; i += 500) await archiveQueue.addBulk(gkgJobs.slice(i, i + 500));
    for (let i = 0; i < docJobs.length; i += 500) await docQueue.addBulk(docJobs.slice(i, i + 500));
    return slices.length;
  }

  async markSliceRunning(sliceId: string): Promise<void> {
    await this.db.query(
      `UPDATE backfill_slices SET status = 'running', attempts = attempts + 1, updated_at = now() WHERE id = $1`,
      [sliceId],
    );
  }

  async finishSlice(sliceId: string, status: 'done' | 'skipped' | 'failed', fetched: number, matched: number, error: string | null): Promise<void> {
    const [slice] = await this.db.query<{ backfill_id: number }>(
      `UPDATE backfill_slices SET status = $2, fetched = $3, matched = $4, error = $5, updated_at = now()
        WHERE id = $1 RETURNING backfill_id`,
      [sliceId, status, fetched, matched, error],
    );
    if (!slice) return;
    await this.db.query(
      `UPDATE backfills b
          SET status = CASE WHEN EXISTS (SELECT 1 FROM backfill_slices s WHERE s.backfill_id = b.id AND s.status = 'failed')
                            THEN 'failed' ELSE 'completed' END,
              completed_at = now()
        WHERE b.id = $1 AND b.status = 'running'
          AND NOT EXISTS (SELECT 1 FROM backfill_slices s WHERE s.backfill_id = b.id AND s.status IN ('pending', 'running'))`,
      [slice.backfill_id],
    );
  }

  /**
   * Self-healing: failed slices (e.g. GDELT throttling for longer than a job's retries) are
   * re-queued periodically until they have been attempted MAX_SLICE_ATTEMPTS times.
   */
  async resumeFailedSlices(): Promise<number> {
    const rows = await this.db.query<{ backfill_id: number }>(
      `SELECT DISTINCT s.backfill_id FROM backfill_slices s JOIN backfills b ON b.id = s.backfill_id
        WHERE s.status = 'failed' AND s.attempts < $1 AND b.status IN ('running', 'failed')`,
      [MAX_SLICE_ATTEMPTS],
    );
    let total = 0;
    for (const r of rows) {
      const slices = await this.db.query<{ id: string; provider: string }>(
        `SELECT id, provider FROM backfill_slices WHERE backfill_id = $1 AND status = 'failed' AND attempts < $2`,
        [r.backfill_id, MAX_SLICE_ATTEMPTS],
      );
      for (const sl of slices) {
        await (sl.provider === 'gdelt-gkg' ? this.queues.get(QUEUES.ARCHIVE) : this.queues.get(QUEUES.INGESTION))
          .remove(`bf-slice-${sl.id}`)
          .catch(() => 0);
      }
      await this.db.query(
        `UPDATE backfill_slices SET status = 'pending', updated_at = now() WHERE id = ANY($1::bigint[])`,
        [slices.map((x) => x.id)],
      );
      await this.db.query(`UPDATE backfills SET status = 'running', completed_at = NULL WHERE id = $1`, [r.backfill_id]);
      total += await this.dispatchBackfill(r.backfill_id, false);
    }
    if (total > 0) this.logger.log(`Re-queued ${total} unfinished backfill slices`);
    return total;
  }

  /** On worker start: create the configured initial backfill once, and resume unfinished ones. */
  async ensureInitialBackfill(): Promise<void> {
    const running = await this.db.query<{ id: number }>(`SELECT id FROM backfills WHERE status = 'running' ORDER BY id`);
    for (const bf of running) {
      const n = await this.dispatchBackfill(bf.id, false);
      if (n > 0) this.logger.log(`Resumed backfill ${bf.id}: ${n} unfinished slices re-enqueued`);
    }
    const { INITIAL_BACKFILL_FROM: fromStr, INITIAL_BACKFILL_TO: toStr, DEFAULT_NICHE } = this.config;
    if (!fromStr) return;
    const from = parseDayBoundary(fromStr, 'start');
    const to = toStr ? parseDayBoundary(toStr, 'end') : new Date();
    const key = `initial-backfill:${DEFAULT_NICHE}:${fromStr}:${toStr ?? 'now'}`;
    const done = await this.db.one('SELECT 1 FROM system_settings WHERE key = $1', [key]);
    if (done) return;
    const bf = await this.createBackfill(DEFAULT_NICHE, from, to, 'auto');
    await this.db.query(
      `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify({ backfillId: bf.id, createdAt: new Date().toISOString() })],
    );
  }
}
