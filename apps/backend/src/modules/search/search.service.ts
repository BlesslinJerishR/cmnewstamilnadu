import { Injectable, Logger } from '@nestjs/common';
import type { ArticleSummary, SearchResponse } from '@cmnews/shared';
import { decodeCursor, encodeCursor, isTimeCursor } from '../../common/cursor';
import { toMatchText } from '../../common/text';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { ArticleSearchDocument } from '../../infrastructure/opensearch/article-index.definition';
import { OpenSearchService } from '../../infrastructure/opensearch/opensearch.service';
import { SUMMARY_COLUMNS, SummaryRow, toSummary } from '../news/news.service';

export interface SearchParams {
  nicheSlug: string;
  nicheId: number;
  q: string;
  category?: string;
  source?: string;
  from?: Date;
  to?: Date;
  sort: 'relevance' | 'latest';
  cursor?: string;
  limit: number;
}

type SortValues = Array<string | number>;
const isSearchCursor = (v: unknown): v is { s: SortValues } =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as { s: unknown }).s) &&
  (v as { s: unknown[] }).s.length <= 3 &&
  (v as { s: unknown[] }).s.every((x) => typeof x === 'string' || typeof x === 'number');

const SOURCE_FIELDS = [
  'id', 'title', 'description', 'url', 'source_name', 'source_domain', 'published_at', 'categories', 'image_url',
];

function docToSummary(d: ArticleSearchDocument): ArticleSummary {
  return {
    id: d.id,
    title: d.title,
    description: d.description ?? null,
    url: d.url,
    sourceName: d.source_name,
    sourceDomain: d.source_domain,
    publishedAt: d.published_at,
    categories: d.categories ?? [],
    imageUrl: d.image_url ?? null,
  };
}

/**
 * Full-text search through OpenSearch.
 *
 * Result lists are served straight from the indexed documents: they contain every field a
 * result card needs, and only accepted articles are ever indexed. The article detail
 * endpoint always reads PostgreSQL, the source of truth.
 *
 * Ranking: BM25 text relevance (title > description, exact wording and phrases boosted),
 * multiplied by a factor combining freshness (Gaussian decay on published_at) and the
 * article's deterministic relevance score.
 *
 * If OpenSearch is unavailable, a simpler PostgreSQL trigram search is used and the response
 * is flagged `degraded: true`.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly os: OpenSearchService,
    private readonly db: DatabaseService,
  ) {}

  buildQuery(p: SearchParams, searchAfter: SortValues | null) {
    const filter: unknown[] = [{ term: { niche: p.nicheSlug } }];
    if (p.category) filter.push({ term: { categories: p.category } });
    if (p.source) filter.push({ term: { source_domain: p.source } });
    if (p.from || p.to) {
      filter.push({
        range: { published_at: { ...(p.from ? { gte: p.from.toISOString() } : {}), ...(p.to ? { lt: p.to.toISOString() } : {}) } },
      });
    }
    const text = p.q.trim();
    const bool = {
      must: [
        {
          multi_match: {
            query: text,
            type: 'best_fields',
            fields: ['title^3', 'title.exact^4', 'description', 'description.exact^1.5', 'source_name^0.5'],
            operator: 'or',
            minimum_should_match: '2<75%',
            tie_breaker: 0.2,
          },
        },
      ],
      should: [
        { match_phrase: { 'title.exact': { query: text, slop: 1, boost: 6 } } },
        { match_phrase: { 'description.exact': { query: text, slop: 2, boost: 2 } } },
      ],
      filter,
    };
    const query = {
      function_score: {
        query: { bool },
        functions: [
          { gauss: { published_at: { origin: 'now', scale: '14d', offset: '1d', decay: 0.5 } }, weight: 1 },
          { field_value_factor: { field: 'relevance_score', factor: 0.01, modifier: 'none', missing: 50 }, weight: 1 },
        ],
        score_mode: 'sum',
        boost_mode: 'multiply',
      },
    };
    const sort =
      p.sort === 'latest'
        ? [{ published_at: 'desc' }, { id: 'desc' }]
        : [{ _score: 'desc' }, { published_at: 'desc' }, { id: 'desc' }];
    return {
      query,
      sort,
      size: p.limit + 1,
      track_total_hits: 10000,
      _source: SOURCE_FIELDS,
      ...(searchAfter ? { search_after: searchAfter } : {}),
    };
  }

  async search(p: SearchParams): Promise<SearchResponse> {
    let cursor: { s: SortValues } | null = null;
    if (p.cursor) {
      try {
        cursor = decodeCursor(p.cursor, isSearchCursor);
      } catch {
        // A time cursor comes from a degraded (PostgreSQL) page: keep paginating there.
        decodeCursor(p.cursor, isTimeCursor);
        return this.fallback(p);
      }
    }
    try {
      const res = await this.os.client.search({ index: this.os.alias, body: this.buildQuery(p, cursor?.s ?? null) as never });
      const hits = (res.body.hits.hits ?? []) as unknown as Array<{ _source: ArticleSearchDocument; sort?: SortValues }>;
      const total = res.body.hits.total;
      const page = hits.slice(0, p.limit);
      const last = page[page.length - 1];
      return {
        items: page.map((h) => docToSummary(h._source)),
        nextCursor: hits.length > p.limit && last?.sort ? encodeCursor({ s: last.sort }) : null,
        total: typeof total === 'number' ? total : Number(total?.value ?? page.length),
        degraded: false,
      };
    } catch (err) {
      if (cursor) {
        // An OpenSearch cursor cannot continue in PostgreSQL; start the fallback from the top.
        this.logger.warn(`Search fallback discarding OpenSearch cursor: ${(err as Error).message}`);
      } else {
        this.logger.warn(`OpenSearch search failed, using PostgreSQL fallback: ${(err as Error).message}`);
      }
      return this.fallback({ ...p, cursor: cursor ? undefined : p.cursor });
    }
  }

  /**
   * PostgreSQL fallback: every word must appear in the headline. Each word is its own ILIKE
   * condition so the trigram GIN index on normalized_title can be used (ILIKE ALL(array) cannot).
   */
  async fallback(p: SearchParams): Promise<SearchResponse> {
    const words = toMatchText(p.q).split(' ').filter((w) => w.length > 1).slice(0, 8);
    const timeCursor = decodeCursor(p.cursor, isTimeCursor);
    const params: unknown[] = [
      p.nicheId,
      p.category ?? null,
      p.source ?? null,
      p.from?.toISOString() ?? null,
      p.to?.toISOString() ?? null,
      timeCursor?.p ?? null,
      timeCursor?.i ?? '0',
      p.limit + 1,
    ];
    const wordClauses = words.map((w) => {
      params.push(`%${w.replace(/[%_\\]/g, '')}%`);
      return `AND a.normalized_title ILIKE $${params.length}`;
    });
    const rows = await this.db.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS}
         FROM articles a
        WHERE a.niche_id = $1 AND a.status = 'accepted'
          ${wordClauses.join('\n          ')}
          AND ($2::text IS NULL OR EXISTS (
                SELECT 1 FROM article_categories ac
                 WHERE ac.article_id = a.id
                   AND ac.category_id = (SELECT id FROM categories WHERE slug = $2 AND enabled)))
          AND ($3::text IS NULL OR a.source_domain = $3)
          AND ($4::timestamptz IS NULL OR a.published_at >= $4)
          AND ($5::timestamptz IS NULL OR a.published_at < $5)
          AND ($6::timestamptz IS NULL OR (a.published_at, a.id) < ($6::timestamptz, $7::bigint))
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT $8`,
      params,
    );
    const page = rows.slice(0, p.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toSummary),
      nextCursor:
        rows.length > p.limit && last ? encodeCursor({ p: new Date(last.published_at).toISOString(), i: String(last.id) }) : null,
      total: page.length,
      degraded: true,
    };
  }

  /** Headline autocomplete (search_as_you_type on title). */
  async suggest(nicheSlug: string, prefix: string, limit = 8): Promise<string[]> {
    try {
      const res = await this.os.client.search({
        index: this.os.alias,
        body: {
          size: limit,
          _source: ['title'],
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: prefix,
                    type: 'bool_prefix',
                    fields: ['title.suggest', 'title.suggest._2gram', 'title.suggest._3gram'],
                  },
                },
              ],
              filter: [{ term: { niche: nicheSlug } }],
            },
          },
        } as never,
      });
      const titles = (res.body.hits.hits as unknown as Array<{ _source: { title: string } }>).map((h) => h._source.title);
      return [...new Set(titles)];
    } catch {
      return [];
    }
  }
}
