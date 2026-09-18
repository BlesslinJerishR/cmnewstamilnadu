import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { JOBS, QUEUES, QueueName } from '../../infrastructure/queue/queue.constants';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { writeOutbox } from '../indexing/outbox';
import { IndexingService } from '../indexing/indexing.service';
import { IngestionService, parseDayBoundary } from '../ingestion/ingestion.service';
import { NichesService } from '../niches/niches.service';
import { ArticleProcessorService } from '../processing/article-processor.service';
import { validateRule } from '../relevance/relevance.engine';
import { SourcesService } from '../sources/sources.service';
import { AdminGuard, CurrentUser } from '../users/auth.guard';
import { AuthenticatedUser } from '../users/users.service';
import { idParamSchema } from '../news/news.schemas';

const intId = z.coerce.number().int().positive();
const fieldsSchema = z.array(z.enum(['title', 'description', 'url', 'entities'])).min(1);

const articleListSchema = z.object({
  status: z.enum(['accepted', 'pending_review', 'rejected', 'duplicate']).optional(),
  q: z.string().trim().max(200).optional(),
  beforeId: z.string().regex(/^\d{1,18}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const articlePatchSchema = z
  .object({
    status: z.enum(['accepted', 'rejected']).nullable().optional(),
    categories: z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(10).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.categories !== undefined, 'nothing to update');

const queryCreateSchema = z.object({
  niche: z.string().default('tn-cm'),
  name: z.string().regex(/^[a-z0-9-]{2,60}$/),
  queryText: z.string().trim().min(3).max(500),
  sourceLanguage: z.string().regex(/^[a-z]*$/).max(20).default('english'),
  priority: z.number().int().min(1).max(10).default(5),
  enabled: z.boolean().default(true),
  windowMinutes: z.number().int().min(15).max(10080).default(180),
  maxResults: z.number().int().min(1).max(250).default(250),
  relevanceWeight: z.number().min(0).max(100).default(20),
});
const queryPatchSchema = queryCreateSchema.omit({ niche: true, name: true }).partial();

const ruleCreateSchema = z.object({
  niche: z.string().default('tn-cm'),
  name: z.string().regex(/^[a-z0-9:-]{2,60}$/),
  ruleType: z.enum(['phrase', 'regex', 'proximity']),
  pattern: z.string().min(1).max(500),
  patternB: z.string().min(1).max(500).nullable().default(null),
  maxDistance: z.number().int().min(1).max(50).nullable().default(null),
  fields: fieldsSchema.default(['title', 'description', 'url', 'entities']),
  weight: z.number().min(-100).max(100),
  enabled: z.boolean().default(true),
  notes: z.string().max(500).nullable().default(null),
});
const rulePatchSchema = ruleCreateSchema.omit({ niche: true, name: true }).partial();

const sourcePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(['active', 'trusted', 'blocked']).optional(),
    trustWeight: z.number().min(-50).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to update');

const backfillSchema = z.object({
  niche: z.string().default('tn-cm'),
  from: z.string().min(10).max(40),
  to: z.string().min(10).max(40),
  strategy: z.enum(['auto', 'doc', 'gkg']).default('auto'),
});

const QUEUE_NAMES = Object.values(QUEUES) as string[];

/**
 * Minimal administration API (no AI moderation). Every mutating call is recorded in
 * admin_audit_log. Relevance/category/source edits take effect for new articles within a
 * minute; use the rescore endpoints to re-apply them to stored articles.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly db: DatabaseService,
    private readonly queues: QueueService,
    private readonly niches: NichesService,
    private readonly sources: SourcesService,
    private readonly processor: ArticleProcessorService,
    private readonly ingestion: IngestionService,
    private readonly indexing: IndexingService,
    private readonly cache: CacheService,
  ) {}

  private async audit(user: AuthenticatedUser, action: string, entity: string, entityId: string | number | null, details?: unknown) {
    await this.db.query('INSERT INTO admin_audit_log (user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)', [
      user.id,
      action,
      entity,
      entityId === null ? null : String(entityId),
      details === undefined ? null : JSON.stringify(details),
    ]);
  }

  // ------------------------------------------------------------------ articles

  @Get('articles')
  listArticles(@Query(new ZodValidationPipe(articleListSchema)) q: z.infer<typeof articleListSchema>) {
    return this.db.query(
      `SELECT id, title, original_url, source_domain, published_at, status, relevance_score, relevance_status,
              quality_status, quality_reasons, duplicate_of_id, duplicate_reason, manual_status, provider, first_seen_at
         FROM articles
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::text IS NULL OR normalized_title ILIKE '%' || $2 || '%')
          AND ($3::bigint IS NULL OR id < $3)
        ORDER BY id DESC LIMIT $4`,
      [q.status ?? null, q.q ? q.q.toLowerCase().replace(/[%_\\]/g, '') : null, q.beforeId ?? null, q.limit],
    );
  }

  @Get('articles/:id')
  async getArticle(@Param('id', new ZodValidationPipe(idParamSchema)) id: string) {
    const article = await this.db.one('SELECT * FROM articles WHERE id = $1', [id]);
    if (!article) throw new NotFoundException('Article not found');
    const categories = await this.db.query(
      `SELECT c.slug, ac.score, ac.assigned_by FROM article_categories ac JOIN categories c ON c.id = ac.category_id WHERE ac.article_id = $1`,
      [id],
    );
    const duplicates = await this.db.query(
      'SELECT id, title, source_domain, original_url, duplicate_reason, published_at FROM articles WHERE duplicate_of_id = $1 ORDER BY id',
      [id],
    );
    return { article, categories, duplicates };
  }

  @Patch('articles/:id')
  async patchArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @Body(new ZodValidationPipe(articlePatchSchema)) body: z.infer<typeof articlePatchSchema>,
  ) {
    const exists = await this.db.one('SELECT 1 FROM articles WHERE id = $1', [id]);
    if (!exists) throw new NotFoundException('Article not found');
    await this.db.transaction(async (tx) => {
      if (body.status !== undefined) {
        await tx.query('UPDATE articles SET manual_status = $2, updated_at = now() WHERE id = $1', [id, body.status]);
      }
      if (body.categories !== undefined) {
        if (body.categories === null) {
          await tx.query('UPDATE articles SET manual_categories = false WHERE id = $1', [id]);
          await tx.query(`DELETE FROM article_categories WHERE article_id = $1 AND assigned_by = 'manual'`, [id]);
        } else {
          const known = await tx.query<{ id: number; slug: string }>('SELECT id, slug FROM categories WHERE slug = ANY($1::text[])', [body.categories]);
          if (known.length !== body.categories.length) throw new BadRequestException('Unknown category slug');
          await tx.query('UPDATE articles SET manual_categories = true, updated_at = now() WHERE id = $1', [id]);
          await tx.query('DELETE FROM article_categories WHERE article_id = $1', [id]);
          await tx.query(
            `INSERT INTO article_categories (article_id, category_id, score, assigned_by) SELECT $1, unnest($2::smallint[]), 0, 'manual'`,
            [id, known.map((k) => k.id)],
          );
        }
      }
      await writeOutbox(tx, [id]);
    });
    const result = await this.processor.recomputeWithDependents(id);
    await this.audit(user, 'article.update', 'article', id, body);
    await this.processor.triggerIndexing();
    await this.cache.bumpGeneration();
    return result;
  }

  @Post('articles/:id/rescore')
  async rescoreArticle(@CurrentUser() user: AuthenticatedUser, @Param('id', new ZodValidationPipe(idParamSchema)) id: string) {
    const result = await this.processor.recomputeWithDependents(id);
    if (!result) throw new NotFoundException('Article not found');
    await this.audit(user, 'article.rescore', 'article', id);
    await this.processor.triggerIndexing();
    return result;
  }

  /** Re-applies current rules to every stored article, in the background. */
  @Post('relevance/rescore')
  @HttpCode(202)
  async rescoreAll(@CurrentUser() user: AuthenticatedUser) {
    this.niches.invalidate();
    const job = await this.queues.add(QUEUES.MAINTENANCE, JOBS.RESCORE_ALL, {}, { attempts: 1 });
    await this.audit(user, 'relevance.rescore_all', 'articles', null);
    return { jobId: job.id };
  }

  // ------------------------------------------------------------------ queries

  @Get('queries')
  listQueries() {
    return this.db.query('SELECT q.*, n.slug AS niche FROM gdelt_queries q JOIN niches n ON n.id = q.niche_id ORDER BY q.niche_id, q.priority, q.id');
  }

  @Post('queries')
  async createQuery(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(queryCreateSchema)) b: z.infer<typeof queryCreateSchema>) {
    const niche = await this.niches.getBySlug(b.niche);
    const [row] = await this.db.query(
      `INSERT INTO gdelt_queries (niche_id, name, query_text, source_language, priority, enabled, window_minutes, max_results, relevance_weight)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [niche.id, b.name, b.queryText, b.sourceLanguage, b.priority, b.enabled, b.windowMinutes, b.maxResults, b.relevanceWeight],
    );
    this.niches.invalidate(niche.id);
    await this.audit(user, 'query.create', 'gdelt_query', (row as { id: number }).id, b);
    return row;
  }

  @Patch('queries/:id')
  async patchQuery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(intId)) id: number,
    @Body(new ZodValidationPipe(queryPatchSchema)) b: z.infer<typeof queryPatchSchema>,
  ) {
    const rows = await this.db.query(
      `UPDATE gdelt_queries SET
          query_text = COALESCE($2, query_text), source_language = COALESCE($3, source_language),
          priority = COALESCE($4, priority), enabled = COALESCE($5, enabled),
          window_minutes = COALESCE($6, window_minutes), max_results = COALESCE($7, max_results),
          relevance_weight = COALESCE($8, relevance_weight), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [id, b.queryText ?? null, b.sourceLanguage ?? null, b.priority ?? null, b.enabled ?? null, b.windowMinutes ?? null, b.maxResults ?? null, b.relevanceWeight ?? null],
    );
    if (rows.length === 0) throw new NotFoundException('Query not found');
    this.niches.invalidate();
    await this.audit(user, 'query.update', 'gdelt_query', id, b);
    return rows[0];
  }

  // ------------------------------------------------------------------ relevance rules

  @Get('rules')
  listRules() {
    return this.db.query('SELECT r.*, n.slug AS niche FROM relevance_rules r JOIN niches n ON n.id = r.niche_id ORDER BY r.niche_id, r.weight DESC, r.id');
  }

  @Post('rules')
  async createRule(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(ruleCreateSchema)) b: z.infer<typeof ruleCreateSchema>) {
    this.validateRuleOrThrow(b);
    const niche = await this.niches.getBySlug(b.niche);
    const [row] = await this.db.query(
      `INSERT INTO relevance_rules (niche_id, name, rule_type, pattern, pattern_b, max_distance, fields, weight, enabled, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [niche.id, b.name, b.ruleType, b.pattern, b.patternB, b.maxDistance, b.fields, b.weight, b.enabled, b.notes],
    );
    this.niches.invalidate(niche.id);
    await this.audit(user, 'rule.create', 'relevance_rule', (row as { id: number }).id, b);
    return row;
  }

  @Patch('rules/:id')
  async patchRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(intId)) id: number,
    @Body(new ZodValidationPipe(rulePatchSchema)) b: z.infer<typeof rulePatchSchema>,
  ) {
    const current = await this.db.one<{ rule_type: 'phrase' | 'regex' | 'proximity'; pattern: string; pattern_b: string | null; max_distance: number | null }>(
      'SELECT rule_type, pattern, pattern_b, max_distance FROM relevance_rules WHERE id = $1',
      [id],
    );
    if (!current) throw new NotFoundException('Rule not found');
    this.validateRuleOrThrow({
      ruleType: b.ruleType ?? current.rule_type,
      pattern: b.pattern ?? current.pattern,
      patternB: b.patternB !== undefined ? b.patternB : current.pattern_b,
      maxDistance: b.maxDistance !== undefined ? b.maxDistance : current.max_distance,
    });
    const [row] = await this.db.query(
      `UPDATE relevance_rules SET
          rule_type = COALESCE($2, rule_type), pattern = COALESCE($3, pattern),
          pattern_b = CASE WHEN $4::boolean THEN $5 ELSE pattern_b END,
          max_distance = CASE WHEN $6::boolean THEN $7::smallint ELSE max_distance END,
          fields = COALESCE($8, fields), weight = COALESCE($9, weight), enabled = COALESCE($10, enabled),
          notes = CASE WHEN $11::boolean THEN $12 ELSE notes END, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [
        id, b.ruleType ?? null, b.pattern ?? null,
        b.patternB !== undefined, b.patternB ?? null,
        b.maxDistance !== undefined, b.maxDistance ?? null,
        b.fields ?? null, b.weight ?? null, b.enabled ?? null,
        b.notes !== undefined, b.notes ?? null,
      ],
    );
    this.niches.invalidate();
    await this.audit(user, 'rule.update', 'relevance_rule', id, b);
    return row;
  }

  private validateRuleOrThrow(rule: { ruleType: 'phrase' | 'regex' | 'proximity'; pattern: string; patternB: string | null; maxDistance: number | null }) {
    try {
      validateRule(rule);
    } catch (err) {
      throw new BadRequestException({ code: 'invalid_rule', message: (err as Error).message });
    }
  }

  // ------------------------------------------------------------------ sources

  @Get('sources')
  listSources(@Query(new ZodValidationPipe(z.object({ status: z.enum(['active', 'trusted', 'blocked']).optional() }))) q: { status?: string }) {
    return this.db.query(
      `SELECT s.*, (SELECT count(*) FROM articles a WHERE a.source_id = s.id AND a.status = 'accepted') AS accepted_articles
         FROM sources s WHERE ($1::text IS NULL OR s.status = $1) ORDER BY s.domain LIMIT 2000`,
      [q.status ?? null],
    );
  }

  @Patch('sources/:id')
  async patchSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(intId)) id: number,
    @Body(new ZodValidationPipe(sourcePatchSchema)) b: z.infer<typeof sourcePatchSchema>,
  ) {
    const rows = await this.db.query<{ domain: string }>(
      `UPDATE sources SET name = COALESCE($2, name), status = COALESCE($3, status), trust_weight = COALESCE($4, trust_weight), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [id, b.name ?? null, b.status ?? null, b.trustWeight ?? null],
    );
    if (rows.length === 0) throw new NotFoundException('Source not found');
    this.sources.invalidate(rows[0].domain);
    if (b.name) await this.db.query('UPDATE articles SET source_name = $2 WHERE source_id = $1', [id, b.name]);
    // Blocking/unblocking changes visibility of stored articles: re-evaluate them in the background.
    await this.queues.add(QUEUES.MAINTENANCE, JOBS.RESCORE_ALL, { sourceId: id }, { attempts: 1 });
    await this.audit(user, 'source.update', 'source', id, b);
    return rows[0];
  }

  // ------------------------------------------------------------------ ingestion & backfill

  @Get('ingestion/runs')
  runs(@Query(new ZodValidationPipe(z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), status: z.string().max(20).optional() }))) q: { limit: number; status?: string }) {
    return this.db.query(
      `SELECT r.*, q.name AS query_name FROM ingestion_runs r LEFT JOIN gdelt_queries q ON q.id = r.query_id
        WHERE ($2::text IS NULL OR r.status = $2) ORDER BY r.id DESC LIMIT $1`,
      [q.limit, q.status ?? null],
    );
  }

  @Get('ingestion/summary')
  summary() {
    return this.db.query(
      `SELECT provider, kind, count(*) AS runs, count(*) FILTER (WHERE status = 'failed') AS failed,
              sum(fetched) AS fetched, sum(accepted) AS accepted, sum(pending) AS pending, sum(rejected) AS rejected,
              sum(duplicates) AS duplicates, sum(existing) AS existing, round(avg(duration_ms)) AS avg_duration_ms
         FROM ingestion_runs WHERE started_at > now() - interval '24 hours' GROUP BY provider, kind ORDER BY provider, kind`,
    );
  }

  @Post('ingestion/run')
  @HttpCode(202)
  async runNow(@CurrentUser() user: AuthenticatedUser) {
    const jobs = await this.ingestion.enqueueCycle('manual');
    await this.audit(user, 'ingestion.run', 'ingestion', null);
    return { enqueued: jobs };
  }

  @Get('backfills')
  listBackfills() {
    return this.db.query(
      `SELECT b.*,
              count(s.*) FILTER (WHERE s.status = 'done') AS done,
              count(s.*) FILTER (WHERE s.status = 'skipped') AS skipped,
              count(s.*) FILTER (WHERE s.status = 'failed') AS failed,
              count(s.*) FILTER (WHERE s.status IN ('pending', 'running')) AS remaining,
              coalesce(sum(s.matched), 0) AS matched
         FROM backfills b LEFT JOIN backfill_slices s ON s.backfill_id = b.id
        GROUP BY b.id ORDER BY b.id DESC`,
    );
  }

  @Post('backfills')
  @HttpCode(202)
  async createBackfill(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(backfillSchema)) b: z.infer<typeof backfillSchema>) {
    const result = await this.ingestion.createBackfill(b.niche, parseDayBoundary(b.from, 'start'), parseDayBoundary(b.to, 'end'), b.strategy);
    await this.audit(user, 'backfill.create', 'backfill', result.id, b);
    return result;
  }

  @Post('backfills/:id/resume')
  @HttpCode(202)
  async resumeBackfill(@CurrentUser() user: AuthenticatedUser, @Param('id', new ZodValidationPipe(intId)) id: number) {
    const slices = await this.ingestion.dispatchBackfill(id, true);
    await this.audit(user, 'backfill.resume', 'backfill', id);
    return { slices };
  }

  @Post('backfills/:id/cancel')
  async cancelBackfill(@CurrentUser() user: AuthenticatedUser, @Param('id', new ZodValidationPipe(intId)) id: number) {
    await this.db.query(`UPDATE backfills SET status = 'cancelled', completed_at = now() WHERE id = $1`, [id]);
    await this.db.query(`UPDATE backfill_slices SET status = 'skipped', error = 'cancelled', updated_at = now() WHERE backfill_id = $1 AND status IN ('pending', 'failed')`, [id]);
    await this.audit(user, 'backfill.cancel', 'backfill', id);
    return { cancelled: true };
  }

  // ------------------------------------------------------------------ indexing & queues

  @Get('indexing/status')
  indexingStatus() {
    return this.indexing.status();
  }

  @Post('indexing/reindex')
  @HttpCode(202)
  async reindex(@CurrentUser() user: AuthenticatedUser) {
    const job = await this.queues.add(QUEUES.INDEXING, JOBS.REINDEX_ALL, {}, { attempts: 1, deduplication: { id: 'reindex-all' } });
    await this.audit(user, 'indexing.reindex', 'search_index', null);
    return { jobId: job.id };
  }

  @Post('indexing/retry-failed')
  async retryIndexing(@CurrentUser() user: AuthenticatedUser) {
    const reset = await this.indexing.retryFailedOutbox();
    await this.processor.triggerIndexing();
    await this.audit(user, 'indexing.retry_failed', 'search_outbox', null, { reset });
    return { reset };
  }

  @Get('queues')
  async queueStats() {
    const out: Record<string, unknown> = {};
    for (const q of this.queues.all()) {
      out[q.name] = await q.getJobCounts('waiting', 'active', 'delayed', 'prioritized', 'failed', 'completed', 'paused');
    }
    return out;
  }

  @Post('queues/:name/retry-failed')
  async retryQueue(@CurrentUser() user: AuthenticatedUser, @Param('name') name: string) {
    if (!QUEUE_NAMES.includes(name)) throw new NotFoundException('Unknown queue');
    await this.queues.get(name as QueueName).retryJobs({ state: 'failed', count: 1000 });
    await this.audit(user, 'queue.retry_failed', 'queue', name);
    return { retried: true };
  }

  @Get('dead-letters')
  deadLetters() {
    return this.db.query('SELECT * FROM dead_letter_jobs WHERE resolved_at IS NULL ORDER BY id DESC LIMIT 200');
  }

  @Post('dead-letters/:id/retry')
  async retryDeadLetter(@CurrentUser() user: AuthenticatedUser, @Param('id', new ZodValidationPipe(intId)) id: number) {
    const row = await this.db.one<{ queue: string; job_name: string; data: unknown }>(
      'SELECT queue, job_name, data FROM dead_letter_jobs WHERE id = $1 AND resolved_at IS NULL',
      [id],
    );
    if (!row) throw new NotFoundException('Dead letter not found');
    if (!QUEUE_NAMES.includes(row.queue)) throw new BadRequestException('Unknown queue');
    const job = await this.queues.add(row.queue as QueueName, row.job_name, row.data ?? {});
    await this.db.query('UPDATE dead_letter_jobs SET resolved_at = now() WHERE id = $1', [id]);
    await this.audit(user, 'dead_letter.retry', 'dead_letter_job', id);
    return { jobId: job.id };
  }

  @Get('audit-log')
  auditLog() {
    return this.db.query('SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT 200');
  }
}
