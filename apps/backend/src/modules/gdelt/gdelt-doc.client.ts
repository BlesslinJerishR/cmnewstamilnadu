import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { RedisService } from '../../infrastructure/redis/redis.module';
import { RawCandidate } from '../processing/candidate';
import { gdeltFetch } from './http';

/** GDELT asked us to slow down (or the shared request slot is held): retry after `retryAfterMs`. */
export class GdeltRateLimitedError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
  }
}
export class GdeltMalformedResponseError extends Error {}
export class GdeltQueryRejectedError extends Error {}
export class GdeltUnavailableError extends Error {}

const docArticleSchema = z.object({
  url: z.string().min(1),
  title: z.string().default(''),
  seendate: z.string().min(8),
  socialimage: z.string().optional().nullable(),
  domain: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  sourcecountry: z.string().optional().nullable(),
});

export interface DocQuery {
  queryId: number;
  queryText: string;
  sourceLanguage: string;
  maxResults: number;
}

export interface DocWindowResult {
  candidates: RawCandidate[];
  requests: number;
  skippedItems: number;
  truncatedWindows: number;
}

const SLOT_KEY = 'gdelt:doc:request-slot';
/** Below this window size a full (250 item) response is accepted as-is instead of split. */
const MIN_SPLIT_WINDOW_MS = 30 * 60 * 1000;
const MAX_DOC_RECORDS = 250;

export function formatGdeltDate(d: Date): string {
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Client for the GDELT DOC 2.0 API ("artlist" mode).
 * - Requests are serialised through a Redis slot so the whole deployment sends at most one
 *   request per GDELT_MIN_REQUEST_INTERVAL_MS, as GDELT's usage policy asks.
 * - GDELT returns plain-text errors with HTTP 200; these are classified, never parsed as data.
 * - Windows that hit the 250 record cap are split in half recursively so nothing is missed.
 */
@Injectable()
export class GdeltDocClient {
  private readonly logger = new Logger(GdeltDocClient.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly redis: RedisService,
  ) {}

  async fetchWindow(query: DocQuery, start: Date, end: Date): Promise<DocWindowResult> {
    const result: DocWindowResult = { candidates: [], requests: 0, skippedItems: 0, truncatedWindows: 0 };
    await this.fetchRecursive(query, start, end, result);
    const seen = new Set<string>();
    result.candidates = result.candidates.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
    return result;
  }

  private async fetchRecursive(query: DocQuery, start: Date, end: Date, acc: DocWindowResult): Promise<void> {
    const limit = Math.min(query.maxResults, MAX_DOC_RECORDS);
    const { items, skipped } = await this.request(query, start, end, limit);
    acc.requests++;
    acc.skippedItems += skipped;
    const span = end.getTime() - start.getTime();
    if (items.length + skipped >= limit && limit === MAX_DOC_RECORDS && span > MIN_SPLIT_WINDOW_MS) {
      const mid = new Date(start.getTime() + Math.floor(span / 2 / 1000) * 1000);
      await this.fetchRecursive(query, start, mid, acc);
      await this.fetchRecursive(query, mid, end, acc);
      return;
    }
    if (items.length + skipped >= limit) acc.truncatedWindows++;
    acc.candidates.push(...items);
  }

  buildUrl(query: DocQuery, start: Date, end: Date, maxRecords: number): string {
    const lang = query.sourceLanguage.trim();
    const q = lang ? `${query.queryText.trim()} sourcelang:${lang}` : query.queryText.trim();
    const params = new URLSearchParams({
      query: q,
      mode: 'artlist',
      format: 'json',
      sort: 'datedesc',
      maxrecords: String(maxRecords),
      startdatetime: formatGdeltDate(start),
      enddatetime: formatGdeltDate(end),
    });
    return `${this.config.GDELT_DOC_API_URL}?${params.toString()}`;
  }

  /**
   * Takes the deployment-wide request slot. Normal spacing (one request per interval) is waited
   * for inline; a longer hold (GDELT's rate-limit cooldown) is reported to the caller instead, so
   * the queue can pause without keeping a worker busy or spending a retry attempt.
   */
  private async acquireSlot(): Promise<void> {
    const interval = this.config.GDELT_MIN_REQUEST_INTERVAL_MS;
    const maxInlineWait = interval + 5_000;
    const started = Date.now();
    for (;;) {
      const ok = await this.redis.bullmq.set(SLOT_KEY, String(Date.now()), 'PX', interval, 'NX');
      if (ok === 'OK') return;
      const ttl = Math.max(await this.redis.bullmq.pttl(SLOT_KEY), 250);
      if (Date.now() - started + ttl > maxInlineWait) {
        throw new GdeltRateLimitedError('GDELT request slot held (rate-limit cooldown)', ttl);
      }
      await new Promise((r) => setTimeout(r, ttl + Math.floor(Math.random() * 250)));
    }
  }

  /** After GDELT complains, hold the slot longer so every process backs off together. */
  private async penalise(ms: number): Promise<void> {
    await this.redis.bullmq.set(SLOT_KEY, 'penalty', 'PX', ms).catch(() => undefined);
  }

  private async request(query: DocQuery, start: Date, end: Date, maxRecords: number): Promise<{ items: RawCandidate[]; skipped: number }> {
    await this.acquireSlot();
    const url = this.buildUrl(query, start, end, maxRecords);
    let res: Awaited<ReturnType<typeof gdeltFetch>>;
    try {
      res = await gdeltFetch(url, {
        headers: { 'User-Agent': this.config.GDELT_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.GDELT_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // GDELT sometimes drops connections instead of answering while it throttles a client;
      // back off every process briefly instead of hammering it.
      await this.penalise(Math.min(60_000, this.config.GDELT_RATE_LIMIT_COOLDOWN_MS));
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      throw new GdeltUnavailableError(`GDELT DOC request failed: ${(err as Error).message}${cause ? ` (${cause.code ?? cause.message})` : ''}`);
    }
    let body: string;
    try {
      body = await res.text();
    } catch (err) {
      throw new GdeltUnavailableError(`GDELT DOC response interrupted: ${(err as Error).message}`);
    }
    if (res.status === 429 || /limit requests to one every/i.test(body.slice(0, 300))) {
      await this.penalise(this.config.GDELT_RATE_LIMIT_COOLDOWN_MS);
      throw new GdeltRateLimitedError('GDELT DOC API rate limit response', this.config.GDELT_RATE_LIMIT_COOLDOWN_MS);
    }
    if (res.status >= 500) throw new GdeltUnavailableError(`GDELT DOC API returned HTTP ${res.status}`);
    if (res.status >= 400) throw new GdeltQueryRejectedError(`GDELT DOC API returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    return this.parse(body, query.queryId);
  }

  parse(body: string, queryId: number): { items: RawCandidate[]; skipped: number } {
    const trimmed = body.trim();
    if (trimmed === '' || trimmed === '{}' || trimmed === '{ }') return { items: [], skipped: 0 };
    if (!trimmed.startsWith('{')) {
      // Plain-text answers are errors such as "Your search contained a phrase that is too short".
      throw new GdeltQueryRejectedError(`GDELT rejected the query: ${trimmed.slice(0, 200)}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      try {
        // GDELT occasionally emits raw control characters inside strings.
        json = JSON.parse(trimmed.replace(/[\u0000-\u001f]+/g, ' '));
      } catch (err) {
        throw new GdeltMalformedResponseError(`Unparseable GDELT JSON: ${(err as Error).message}`);
      }
    }
    const articles = (json as { articles?: unknown }).articles;
    if (articles === undefined) return { items: [], skipped: 0 };
    if (!Array.isArray(articles)) throw new GdeltMalformedResponseError('GDELT JSON "articles" is not an array');
    const items: RawCandidate[] = [];
    let skipped = 0;
    for (const raw of articles) {
      const parsed = docArticleSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.title.trim()) {
        skipped++;
        continue;
      }
      const a = parsed.data;
      items.push({
        provider: 'gdelt-doc',
        providerRef: null,
        url: a.url,
        title: a.title,
        description: null,
        imageUrl: a.socialimage || null,
        sourceDomain: a.domain || null,
        sourceCountry: a.sourcecountry || null,
        language: a.language || null,
        publishedAt: a.seendate,
        matchedQueryId: queryId,
        metadata: { seendate: a.seendate, domain: a.domain ?? null },
      });
    }
    return { items, skipped };
  }
}
