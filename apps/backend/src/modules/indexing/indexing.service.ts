import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { ArticleSearchDocument } from '../../infrastructure/opensearch/article-index.definition';
import { OpenSearchService } from '../../infrastructure/opensearch/opensearch.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

const RELAY_BATCH = 200;
const REINDEX_BATCH = 500;
const MAX_OUTBOX_ATTEMPTS = 10;

interface IndexRow {
  id: string;
  niche: string;
  title: string;
  description: string | null;
  source_name: string;
  source_domain: string;
  source_country: string | null;
  categories: string[] | null;
  language: string;
  published_at: Date;
  first_seen_at: Date;
  relevance_score: number;
  original_url: string;
  image_url: string | null;
}

/** Selects the search representation of articles; only rows returned here are public. */
const INDEX_SELECT = `
  SELECT a.id, n.slug AS niche, a.title, a.description, a.source_name, a.source_domain, a.source_country,
         a.language, a.published_at, a.first_seen_at, a.relevance_score, a.original_url, a.image_url,
         COALESCE(array_agg(c.slug ORDER BY c.sort_order) FILTER (WHERE c.slug IS NOT NULL), '{}') AS categories
    FROM articles a
    JOIN niches n ON n.id = a.niche_id
    LEFT JOIN article_categories ac ON ac.article_id = a.id
    LEFT JOIN categories c ON c.id = ac.category_id AND c.enabled`;

function toDocument(r: IndexRow): ArticleSearchDocument {
  return {
    id: String(r.id),
    niche: r.niche,
    title: r.title,
    description: r.description,
    source_name: r.source_name,
    source_domain: r.source_domain,
    source_country: r.source_country,
    categories: r.categories ?? [],
    language: r.language,
    published_at: new Date(r.published_at).toISOString(),
    first_seen_at: new Date(r.first_seen_at).toISOString(),
    relevance_score: Number(r.relevance_score),
    url: r.original_url,
    image_url: r.image_url,
  };
}

/**
 * Keeps OpenSearch in sync with PostgreSQL.
 *  - Relay: drains the transactional outbox. For each article it reads the *current* row and
 *    either indexes it (accepted, inside the retention window) or deletes it from the index.
 *    Because the document is always rebuilt from PostgreSQL, replays are idempotent.
 *  - Reindex: builds a fresh versioned index from PostgreSQL in keyset-paginated batches and
 *    atomically swaps the alias. This is also the disaster recovery path.
 */
@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly os: OpenSearchService,
    private readonly cache: CacheService,
  ) {}

  private retentionClause(alias: string): string {
    return this.config.OPENSEARCH_RETENTION_DAYS > 0
      ? `AND ${alias}.published_at >= now() - make_interval(days => ${this.config.OPENSEARCH_RETENTION_DAYS})`
      : '';
  }

  async relayOutbox(): Promise<{ processed: number; failed: number }> {
    // Never let a lost index silently turn into an empty one: rebuild it from PostgreSQL.
    if (!(await this.os.aliasExists())) {
      const rebuilt = await this.reindexAll();
      return { processed: rebuilt.documents, failed: 0 };
    }
    let processed = 0;
    let failed = 0;
    // Drain until empty so bursts from a backfill do not wait for the next scheduled tick.
    for (;;) {
      const batch = await this.relayBatch();
      processed += batch.processed;
      failed += batch.failed;
      if (batch.fetched < RELAY_BATCH) break;
    }
    if (processed > 0) await this.cache.bumpGeneration();
    return { processed, failed };
  }

  private async relayBatch(): Promise<{ fetched: number; processed: number; failed: number }> {
    const rows = await this.db.query<{ id: string; article_id: string }>(
      `SELECT id, article_id FROM search_outbox
        WHERE processed_at IS NULL AND attempts < $1
        ORDER BY id LIMIT $2`,
      [MAX_OUTBOX_ATTEMPTS, RELAY_BATCH],
    );
    if (rows.length === 0) return { fetched: 0, processed: 0, failed: 0 };
    const articleIds = [...new Set(rows.map((r) => r.article_id))];
    const docs = await this.db.query<IndexRow>(
      `${INDEX_SELECT}
        WHERE a.id = ANY($1::bigint[]) AND a.status = 'accepted' ${this.retentionClause('a')}
        GROUP BY a.id, n.slug`,
      [articleIds],
    );
    const upserts = docs.map(toDocument);
    const present = new Set(upserts.map((d) => d.id));
    const deletes = articleIds.filter((id) => !present.has(id));

    // A whole-request failure (OpenSearch down, timeout) does not count against the rows'
    // attempts: they simply stay pending until OpenSearch is reachable again. Only per-document
    // rejections count, so a poison document cannot block the queue forever.
    const results = await this.os.bulk(this.os.alias, upserts, deletes);
    const failedIds = new Map(results.filter((r) => !r.ok).map((r) => [r.id, r.error ?? 'unknown']));
    const okOutbox = rows.filter((r) => !failedIds.has(r.article_id)).map((r) => r.id);
    const badOutbox = rows.filter((r) => failedIds.has(r.article_id));
    if (okOutbox.length) {
      await this.db.query('UPDATE search_outbox SET processed_at = now() WHERE id = ANY($1::bigint[])', [okOutbox]);
    }
    for (const r of badOutbox) {
      await this.db.query('UPDATE search_outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1', [
        r.id,
        failedIds.get(r.article_id)!.slice(0, 500),
      ]);
    }
    if (badOutbox.length) this.logger.warn(`${badOutbox.length} outbox entries failed to index`);
    return { fetched: rows.length, processed: okOutbox.length, failed: badOutbox.length };
  }

  /**
   * Full rebuild from PostgreSQL into a new index, then an atomic alias swap. Searches keep
   * hitting the old index until the swap. Outbox entries created during the rebuild are
   * replayed afterwards, so no concurrent change is lost.
   */
  async reindexAll(): Promise<{ index: string; documents: number; previous: string[] }> {
    const [{ max_outbox_id: startOutboxId }] = await this.db.query<{ max_outbox_id: string | null }>(
      'SELECT max(id) AS max_outbox_id FROM search_outbox',
    );
    const index = this.os.newIndexName();
    await this.os.createIndex(index);
    let lastPublished: string | null = null;
    let lastId = '0';
    let documents = 0;
    try {
      for (;;) {
        const rows: IndexRow[] = await this.db.query<IndexRow>(
          `${INDEX_SELECT}
            WHERE a.status = 'accepted' ${this.retentionClause('a')}
              AND ($1::timestamptz IS NULL OR (a.published_at, a.id) < ($1::timestamptz, $2::bigint))
            GROUP BY a.id, n.slug
            ORDER BY a.published_at DESC, a.id DESC
            LIMIT $3`,
          [lastPublished, lastId, REINDEX_BATCH],
        );
        if (rows.length === 0) break;
        const results = await this.os.bulk(index, rows.map(toDocument), []);
        const failures = results.filter((r) => !r.ok);
        if (failures.length) throw new Error(`Reindex bulk failures: ${failures[0].error}`);
        documents += rows.length;
        const last = rows[rows.length - 1];
        lastPublished = new Date(last.published_at).toISOString();
        lastId = String(last.id);
      }
      await this.os.refresh(index);
      const previous = await this.os.swapAlias(index);
      // Replay changes that happened while we were copying.
      if (startOutboxId) {
        await this.db.query('UPDATE search_outbox SET processed_at = NULL, attempts = 0 WHERE id > $1', [startOutboxId]);
      }
      await this.relayOutbox();
      await this.cache.bumpGeneration();
      this.logger.log(`Reindexed ${documents} documents into ${index}`);
      return { index, documents, previous };
    } catch (err) {
      await this.os.client.indices.delete({ index }).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Called when the worker starts: if the alias is missing (fresh install, or OpenSearch lost
   * its data) the index is rebuilt from PostgreSQL automatically.
   */
  async ensureIndexReady(): Promise<'ok' | 'rebuilt'> {
    if (await this.os.aliasExists()) return 'ok';
    this.logger.warn('Search alias missing; rebuilding the index from PostgreSQL');
    await this.reindexAll();
    return 'rebuilt';
  }

  async status() {
    const [outbox] = await this.db.query<{ pending: string; failed: string; oldest: Date | null }>(
      `SELECT count(*) FILTER (WHERE attempts < $1) AS pending,
              count(*) FILTER (WHERE attempts >= $1) AS failed,
              min(created_at) AS oldest
         FROM search_outbox WHERE processed_at IS NULL`,
      [MAX_OUTBOX_ATTEMPTS],
    );
    const [pg] = await this.db.query<{ accepted: string }>(`SELECT count(*) AS accepted FROM articles WHERE status = 'accepted'`);
    return {
      alias: this.os.alias,
      indices: await this.os.aliasTargets().catch(() => []),
      indexedDocuments: await this.os.count(),
      acceptedInPostgres: Number(pg.accepted),
      outboxPending: Number(outbox.pending),
      outboxFailed: Number(outbox.failed),
      outboxOldest: outbox.oldest,
      cluster: await this.os.clusterHealth(),
    };
  }

  /** Makes permanently failed outbox rows eligible again (admin "retry"). */
  async retryFailedOutbox(): Promise<number> {
    const rows = await this.db.query(
      'UPDATE search_outbox SET attempts = 0, last_error = NULL WHERE processed_at IS NULL AND attempts >= $1 RETURNING id',
      [MAX_OUTBOX_ATTEMPTS],
    );
    return rows.length;
  }
}
