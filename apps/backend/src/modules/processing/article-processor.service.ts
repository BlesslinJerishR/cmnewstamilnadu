import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService, Queryable } from '../../infrastructure/database/database.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { JOBS, QUEUES } from '../../infrastructure/queue/queue.constants';
import { CategoryAssignment } from '../categories/category.classifier';
import { DeduplicationService, DuplicateMatch } from '../deduplication/deduplication.service';
import { writeOutbox } from '../indexing/outbox';
import { NichesService, PipelineContext } from '../niches/niches.service';
import { assessQuality, QualityResult } from '../quality/quality.filter';
import { RelevanceResult } from '../relevance/relevance.engine';
import { SourcesService } from '../sources/sources.service';
import { NormalizedArticle, RawCandidate } from './candidate';
import { normalizeCandidate } from './normalizer';

export type ArticleStatus = 'accepted' | 'pending_review' | 'rejected' | 'duplicate';
export type ProcessOutcome = ArticleStatus | 'existing' | 'invalid';

export interface BatchCounts {
  accepted: number;
  pending: number;
  rejected: number;
  duplicates: number;
  existing: number;
  invalid: number;
}

export const PUBLIC_LANGUAGES = ['en'];

export function decideStatus(
  relevance: RelevanceResult['status'],
  quality: QualityResult['status'],
  duplicate: DuplicateMatch | null,
): ArticleStatus {
  if (relevance === 'irrelevant' || quality === 'rejected') return 'rejected';
  if (duplicate) return 'duplicate';
  if (relevance === 'review' || quality === 'pending_review') return 'pending_review';
  return 'accepted';
}

interface ExistingRow {
  id: string;
  status: ArticleStatus;
  manual_status: 'accepted' | 'rejected' | null;
  matched_query_ids: number[];
}

/**
 * Runs the article pipeline for provider candidates:
 * normalise -> canonical URL dedup -> relevance -> title/near-duplicate dedup -> quality ->
 * categorise -> store in PostgreSQL (+ search outbox in the same transaction).
 * Every step is deterministic and idempotent, so replaying a batch is always safe.
 */
@Injectable()
export class ArticleProcessorService {
  private readonly logger = new Logger(ArticleProcessorService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly niches: NichesService,
    private readonly sources: SourcesService,
    private readonly dedup: DeduplicationService,
    private readonly queues: QueueService,
  ) {}

  async processBatch(nicheId: number, candidates: RawCandidate[]): Promise<BatchCounts> {
    const ctx = await this.niches.pipelineContext(nicheId);
    const counts: BatchCounts = { accepted: 0, pending: 0, rejected: 0, duplicates: 0, existing: 0, invalid: 0 };
    let publicChanges = 0;
    for (const candidate of candidates) {
      const { outcome, publicChange } = await this.processOne(ctx, candidate);
      if (publicChange) publicChanges++;
      switch (outcome) {
        case 'accepted': counts.accepted++; break;
        case 'pending_review': counts.pending++; break;
        case 'rejected': counts.rejected++; break;
        case 'duplicate': counts.duplicates++; break;
        case 'existing': counts.existing++; break;
        case 'invalid': counts.invalid++; break;
      }
    }
    if (publicChanges > 0) await this.triggerIndexing();
    return counts;
  }

  async triggerIndexing(): Promise<void> {
    await this.queues
      .add(QUEUES.INDEXING, JOBS.OUTBOX_RELAY, {}, { deduplication: { id: 'outbox-relay' }, removeOnComplete: true, removeOnFail: 100 })
      .catch((err: Error) => this.logger.warn(`Could not trigger outbox relay (scheduler will retry): ${err.message}`));
  }

  private async processOne(ctx: PipelineContext, candidate: RawCandidate): Promise<{ outcome: ProcessOutcome; publicChange: boolean }> {
    const normalized = normalizeCandidate(candidate);
    if (!normalized.ok) return { outcome: 'invalid', publicChange: false };
    const article = normalized.article;
    const nicheId = ctx.niche.id;
    article.matchedQueryIds = article.matchedQueryIds.filter((id) => ctx.queryWeights.has(id));

    // Level 1-2 dedup: the canonical URL hash identifies an article across ingestion windows.
    const existing = await this.db.one<ExistingRow>(
      'SELECT id, status, manual_status, matched_query_ids FROM articles WHERE niche_id = $1 AND url_hash = $2',
      [nicheId, article.urlHash],
    );
    if (existing) return this.handleSeenAgain(ctx, existing, article);

    const source = await this.sources.resolve(article.sourceDomain, article.sourceCountry);
    article.sourceCountry = article.sourceCountry ?? source.country;
    const relevance = ctx.relevance.score({
      title: article.title,
      description: article.description,
      url: article.originalUrl,
      entities: article.entities,
      sourceCountry: article.sourceCountry,
      sourceTrustWeight: source.trustWeight,
      matchedQueryWeights: article.matchedQueryIds.map((id) => ctx.queryWeights.get(id) ?? 0),
    });
    const quality = assessQuality(article, { now: new Date(), sourceStatus: source.status, allowedLanguages: PUBLIC_LANGUAGES });

    const provisional = decideStatus(relevance.status, quality.status, null);
    let duplicate: DuplicateMatch | null = null;
    if (provisional === 'accepted' || provisional === 'pending_review') {
      duplicate = await this.dedup.findDuplicate(
        this.db,
        nicheId,
        article,
        provisional === 'accepted' ? ['accepted'] : ['accepted', 'pending_review'],
      );
    }
    const status = decideStatus(relevance.status, quality.status, duplicate);
    const categories =
      status === 'accepted' || status === 'pending_review'
        ? ctx.classifier.classify({ title: article.title, description: article.description, url: article.originalUrl })
        : [];

    const insertedId = await this.db.transaction(async (tx) => {
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO articles (
           niche_id, source_id, provider, provider_ref, original_url, canonical_url, url_hash, title,
           normalized_title, title_hash, description, image_url, author, language, source_domain,
           source_name, source_country, published_at, status, relevance_score, relevance_status,
           relevance_signals, quality_status, quality_reasons, duplicate_of_id, duplicate_reason,
           matched_query_ids, entities, provider_metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
         ON CONFLICT (niche_id, url_hash) DO NOTHING
         RETURNING id`,
        [
          nicheId, source.id, article.provider, article.providerRef, article.originalUrl, article.canonicalUrl,
          article.urlHash, article.title, article.normalizedTitle, article.titleHash, article.description,
          article.imageUrl, article.author, article.language, article.sourceDomain, source.name,
          article.sourceCountry, article.publishedAt.toISOString(), status, relevance.score, relevance.status,
          JSON.stringify(relevance.signals), quality.status, quality.reasons, duplicate?.duplicateOfId ?? null,
          duplicate ? `${duplicate.reason}:${duplicate.similarity}` : null, article.matchedQueryIds,
          article.entities, article.providerMetadata ? JSON.stringify(article.providerMetadata) : null,
        ],
      );
      if (rows.length === 0) return null;
      const id = rows[0].id;
      await this.replaceRuleCategories(tx, id, categories);
      if (status === 'accepted') await writeOutbox(tx, [id]);
      return id;
    });

    if (!insertedId) return { outcome: 'existing', publicChange: false };
    return { outcome: status, publicChange: status === 'accepted' };
  }

  /**
   * The overlapping ingestion windows return the same URL many times. Re-sightings only
   * record the extra query match; if that new evidence lifts a non-public article over the
   * threshold it is re-scored and can be promoted.
   */
  private async handleSeenAgain(
    ctx: PipelineContext,
    existing: ExistingRow,
    article: NormalizedArticle,
  ): Promise<{ outcome: ProcessOutcome; publicChange: boolean }> {
    const merged = [...new Set([...existing.matched_query_ids, ...article.matchedQueryIds])].sort((a, b) => a - b);
    const gainedQueries = merged.length > existing.matched_query_ids.length;
    await this.db.query(
      'UPDATE articles SET last_seen_at = now(), matched_query_ids = $2 WHERE id = $1',
      [existing.id, merged],
    );
    if (gainedQueries && !existing.manual_status && (existing.status === 'pending_review' || existing.status === 'rejected')) {
      const result = await this.recompute(existing.id, ctx);
      return { outcome: 'existing', publicChange: result?.status === 'accepted' };
    }
    return { outcome: 'existing', publicChange: false };
  }

  /**
   * Re-applies relevance, quality, dedup and category rules to a stored article (used after
   * rule edits, source changes and new query evidence). Manual decisions are respected.
   */
  async recompute(articleId: string, ctxIn?: PipelineContext): Promise<{ status: ArticleStatus; changed: boolean } | null> {
    const row = await this.db.one<{
      id: string;
      niche_id: number;
      original_url: string;
      canonical_url: string;
      url_hash: string;
      title: string;
      normalized_title: string;
      title_hash: string;
      description: string | null;
      image_url: string | null;
      author: string | null;
      language: string;
      source_domain: string;
      source_country: string | null;
      published_at: Date;
      status: ArticleStatus;
      manual_status: 'accepted' | 'rejected' | null;
      manual_categories: boolean;
      matched_query_ids: number[];
      entities: string | null;
      duplicate_of_id: string | null;
      duplicate_reason: string | null;
      provider: string;
      provider_ref: string | null;
    }>('SELECT * FROM articles WHERE id = $1', [articleId]);
    if (!row) return null;
    const ctx = ctxIn ?? (await this.niches.pipelineContext(row.niche_id));
    const source = await this.sources.resolve(row.source_domain, row.source_country);
    const article: NormalizedArticle = {
      provider: row.provider,
      providerRef: row.provider_ref,
      originalUrl: row.original_url,
      canonicalUrl: row.canonical_url,
      urlHash: row.url_hash,
      title: row.title,
      normalizedTitle: row.normalized_title,
      titleHash: row.title_hash,
      description: row.description,
      imageUrl: row.image_url,
      author: row.author,
      language: row.language,
      sourceDomain: row.source_domain,
      sourceCountry: row.source_country ?? source.country,
      publishedAt: new Date(row.published_at),
      entities: row.entities,
      matchedQueryIds: row.matched_query_ids,
      providerMetadata: null,
    };
    const relevance = ctx.relevance.score({
      title: article.title,
      description: article.description,
      url: article.originalUrl,
      entities: article.entities,
      sourceCountry: article.sourceCountry,
      sourceTrustWeight: source.trustWeight,
      matchedQueryWeights: article.matchedQueryIds.filter((id) => ctx.queryWeights.has(id)).map((id) => ctx.queryWeights.get(id)!),
    });
    const quality = assessQuality(article, { now: new Date(), sourceStatus: source.status, allowedLanguages: PUBLIC_LANGUAGES });

    let status: ArticleStatus;
    let duplicate: DuplicateMatch | null = null;
    // A copy only stays hidden while the article it duplicates is itself visible or reviewable;
    // if that representative was rejected, the copy is judged on its own again.
    let keepDuplicateOf: string | null = null;
    if (row.duplicate_of_id) {
      const rep = await this.db.one<{ status: ArticleStatus }>('SELECT status FROM articles WHERE id = $1', [row.duplicate_of_id]);
      if (rep && (rep.status === 'accepted' || rep.status === 'pending_review')) keepDuplicateOf = row.duplicate_of_id;
    }
    if (row.manual_status) {
      status = row.manual_status;
    } else if (keepDuplicateOf) {
      status = decideStatus(relevance.status, quality.status, null) === 'rejected' ? 'rejected' : 'duplicate';
    } else {
      const provisional = decideStatus(relevance.status, quality.status, null);
      if (provisional === 'accepted' || provisional === 'pending_review') {
        duplicate = await this.dedup.findDuplicate(
          this.db,
          row.niche_id,
          article,
          provisional === 'accepted' ? ['accepted'] : ['accepted', 'pending_review'],
          row.id,
        );
        // The earliest article stays the representative; never demote it in favour of a later copy.
        if (duplicate && BigInt(duplicate.duplicateOfId) > BigInt(row.id)) duplicate = null;
      }
      status = decideStatus(relevance.status, quality.status, duplicate);
    }
    const categories =
      status === 'accepted' || status === 'pending_review'
        ? ctx.classifier.classify({ title: article.title, description: article.description, url: article.originalUrl })
        : [];

    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE articles
            SET relevance_score = $2, relevance_status = $3, relevance_signals = $4, quality_status = $5,
                quality_reasons = $6, status = $7, source_name = $8, source_id = $9,
                duplicate_of_id = $10, duplicate_reason = $11, updated_at = now()
          WHERE id = $1`,
        [
          row.id, relevance.score, relevance.status, JSON.stringify(relevance.signals), quality.status, quality.reasons,
          status, source.name, source.id,
          keepDuplicateOf ?? duplicate?.duplicateOfId ?? null,
          keepDuplicateOf ? row.duplicate_reason : duplicate ? `${duplicate.reason}:${duplicate.similarity}` : null,
        ],
      );
      if (!row.manual_categories) await this.replaceRuleCategories(tx, row.id, categories);
      if (status === 'accepted' || row.status === 'accepted') await writeOutbox(tx, [row.id]);
    });
    return { status, changed: status !== row.status };
  }

  /**
   * Recomputes an article and then every copy that points at it, so hiding or rejecting a
   * representative lets its syndicated copies be judged on their own.
   */
  async recomputeWithDependents(articleId: string): Promise<{ status: ArticleStatus; changed: boolean } | null> {
    const result = await this.recompute(articleId);
    const copies = await this.db.query<{ id: string }>('SELECT id FROM articles WHERE duplicate_of_id = $1 ORDER BY id', [articleId]);
    for (const c of copies) await this.recompute(c.id);
    return result;
  }

  private async replaceRuleCategories(tx: Queryable, articleId: string, categories: CategoryAssignment[]): Promise<void> {
    await tx.query(`DELETE FROM article_categories WHERE article_id = $1 AND assigned_by = 'rule'`, [articleId]);
    if (categories.length === 0) return;
    await tx.query(
      `INSERT INTO article_categories (article_id, category_id, score, assigned_by)
       SELECT $1, unnest($2::smallint[]), unnest($3::numeric[]), 'rule'
       ON CONFLICT (article_id, category_id) DO NOTHING`,
      [articleId, categories.map((c) => c.categoryId), categories.map((c) => c.score)],
    );
  }
}
