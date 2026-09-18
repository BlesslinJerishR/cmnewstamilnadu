/**
 * Queue topology. There is intentionally no translation or AI queue in the MVP.
 */
export const QUEUES = {
  INGESTION: 'gdelt-ingestion',
  /** GKG archive downloads for backfills: not subject to the DOC API rate limit, so separate. */
  ARCHIVE: 'gdelt-archive',
  PROCESSING: 'article-processing',
  INDEXING: 'search-indexing',
  MAINTENANCE: 'maintenance',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOBS = {
  INGEST_CYCLE: 'ingest-cycle',
  FETCH_DOC_WINDOW: 'fetch-doc-window',
  FETCH_GKG_FILE: 'fetch-gkg-file',
  BACKFILL_DISPATCH: 'backfill-dispatch',
  PROCESS_BATCH: 'process-batch',
  OUTBOX_RELAY: 'outbox-relay',
  REINDEX_ALL: 'reindex-all',
  RETENTION: 'retention',
  RESCORE_ALL: 'rescore-all',
  RESUME_BACKFILLS: 'resume-backfills',
  DISK_CHECK: 'disk-check',
} as const;

/** Defaults applied to every job unless overridden. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 24 * 3600, count: 200 },
  removeOnFail: { age: 7 * 24 * 3600, count: 500 },
};
