import { Pool } from 'pg';
import type { AppConfig } from '../config/app-config';
import { decodeCursor, isTimeCursor } from '../common/cursor';
import { DatabaseService } from '../infrastructure/database/database.service';
import { runMigrations } from '../infrastructure/database/migrator';
import type { QueueService } from '../infrastructure/queue/queue.service';
import type { OpenSearchService } from '../infrastructure/opensearch/opensearch.service';
import { DeduplicationService } from '../modules/deduplication/deduplication.service';
import { NewsService } from '../modules/news/news.service';
import { NichesService } from '../modules/niches/niches.service';
import { RawCandidate } from '../modules/processing/candidate';
import { ArticleProcessorService } from '../modules/processing/article-processor.service';
import { SearchService } from '../modules/search/search.service';
import { SourcesService } from '../modules/sources/sources.service';

/**
 * End-to-end pipeline test against a real PostgreSQL (with pg_trgm), inside a throwaway schema.
 * Runs only when INTEGRATION_DATABASE_URL is set, e.g.
 *   INTEGRATION_DATABASE_URL=postgres://cmnews:cmnews-dev-password@127.0.0.1:55432/cmnews npm test
 */
const BASE_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = BASE_URL ? describe : describe.skip;

suite('article pipeline (PostgreSQL integration)', () => {
  const schema = `it_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let admin: Pool;
  let db: DatabaseService;
  let processor: ArticleProcessorService;
  let news: NewsService;
  let search: SearchService;
  let nicheId: number;

  const hour = 3600 * 1000;
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * hour).toISOString();
  const candidate = (over: Partial<RawCandidate>): RawCandidate => ({
    provider: 'gdelt-doc',
    url: 'https://www.thehindu.com/news/national/tamil-nadu/cm-vijay-story/article1.ece',
    title: 'Tamil Nadu CM Vijay announces free bus travel for women across the state',
    publishedAt: at(2),
    language: 'English',
    sourceCountry: 'India',
    ...over,
  });

  beforeAll(async () => {
    admin = new Pool({ connectionString: BASE_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(BASE_URL!);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    db = new DatabaseService({ DATABASE_URL: url.toString(), DATABASE_POOL_MAX: 4 } as AppConfig);
    await runMigrations(db.pool, () => undefined);
    const niches = new NichesService(db);
    await niches.seed();
    nicheId = (await niches.getBySlug('tn-cm')).id;
    const queues = { add: async () => ({}) } as unknown as QueueService;
    processor = new ArticleProcessorService(db, niches, new SourcesService(db), new DeduplicationService(), queues);
    news = new NewsService(db);
    search = new SearchService({} as OpenSearchService, db);
  }, 60_000);

  afterAll(async () => {
    await db?.pool.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it('accepts a relevant article and stays idempotent across overlapping ingestion windows', async () => {
    const first = await processor.processBatch(nicheId, [candidate({})]);
    expect(first.accepted).toBe(1);
    // Same article again, plus tracking/AMP/www variants of its URL.
    const again = await processor.processBatch(nicheId, [
      candidate({}),
      candidate({ url: 'http://thehindu.com/news/national/tamil-nadu/cm-vijay-story/article1.ece/amp/?utm_source=x' }),
      candidate({ url: 'https://m.thehindu.com/news/national/tamil-nadu/cm-vijay-story/article1.ece#top' }),
    ]);
    expect(again).toMatchObject({ accepted: 0, existing: 3 });
    const [{ n }] = await db.query<{ n: string }>('SELECT count(*) AS n FROM articles');
    expect(Number(n)).toBe(1);
    const [{ outbox }] = await db.query<{ outbox: string }>('SELECT count(*) AS outbox FROM search_outbox');
    expect(Number(outbox)).toBe(1);
  });

  it('marks a syndicated copy from another publisher as a duplicate of the original', async () => {
    const counts = await processor.processBatch(nicheId, [
      candidate({
        url: 'https://www.dailyexcelsior.com/tn-cm-vijay-announces-free-bus-travel-for-women/',
        title: 'Tamil Nadu CM Vijay announces free bus travel for women across state',
        publishedAt: at(1),
      }),
    ]);
    expect(counts.duplicates).toBe(1);
    const [dup] = await db.query<{ duplicate_of_id: string; duplicate_reason: string }>(
      `SELECT duplicate_of_id, duplicate_reason FROM articles WHERE source_domain = 'dailyexcelsior.com'`,
    );
    expect(dup.duplicate_reason).toMatch(/^syndicated/);
    const original = (await news.list({ nicheId, limit: 5 })).items[0];
    const detail = await news.getById(nicheId, original.id);
    expect(detail.alsoReportedBy.map((r) => r.sourceDomain)).toEqual(['dailyexcelsior.com']);
  });

  it('rejects unrelated Vijays and never exposes them publicly', async () => {
    const counts = await processor.processBatch(nicheId, [
      candidate({ url: 'https://example.in/movies/vijay-sethupathi-trailer', title: 'Vijay Sethupathi new movie trailer released today', matchedQueryId: null }),
    ]);
    expect(counts.rejected).toBe(1);
    const page = await news.list({ nicheId, limit: 50 });
    expect(page.items.some((a) => a.title.includes('Sethupathi'))).toBe(false);
  });

  it('paginates category and source feeds newest-first with keyset cursors', async () => {
    const batch: RawCandidate[] = [];
    for (let i = 0; i < 7; i++) {
      batch.push(
        candidate({
          url: `https://www.newindianexpress.com/states/tamil-nadu/2026/cm-vijay-hospital-${i}`,
          title: `CM Vijay inaugurates new government hospital number ${i} in district ${String.fromCharCode(65 + i)} of Tamil Nadu`,
          publishedAt: at(10 + i),
        }),
      );
    }
    await processor.processBatch(nicheId, batch);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      const page = await news.list({ nicheId, category: 'healthcare', cursor, limit: 3 });
      seen.push(...page.items.map((a) => a.id));
      for (const a of page.items) expect(a.categories).toContain('healthcare');
      if (!page.nextCursor) break;
      expect(decodeCursor(page.nextCursor, isTimeCursor)).not.toBeNull();
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);

    const bySource = await news.list({ nicheId, source: 'newindianexpress.com', limit: 50 });
    expect(bySource.items).toHaveLength(7);
    const times = bySource.items.map((a) => Date.parse(a.publishedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    expect((await news.list({ nicheId, category: 'no-such-category', limit: 5 })).items).toEqual([]);
  });

  it('falls back to PostgreSQL search when OpenSearch is unavailable', async () => {
    const result = await search.search({ nicheSlug: 'tn-cm', nicheId, q: 'hospital district', sort: 'relevance', limit: 20 });
    expect(result.degraded).toBe(true);
    expect(result.items.length).toBe(7);
    const none = await search.search({ nicheSlug: 'tn-cm', nicheId, q: 'hospital 100%_', sort: 'latest', limit: 20 });
    expect(none.items).toEqual([]);
  });

  it('re-applies rules without changing stored decisions that still hold', async () => {
    const rows = await db.query<{ id: string }>(`SELECT id FROM articles ORDER BY id`);
    for (const r of rows) await processor.recompute(r.id);
    const statuses = await db.query<{ status: string; n: string }>('SELECT status, count(*) AS n FROM articles GROUP BY status ORDER BY status');
    expect(Object.fromEntries(statuses.map((s) => [s.status, Number(s.n)]))).toEqual({ accepted: 8, duplicate: 1, rejected: 1 });
  });
});
