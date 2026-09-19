import { Injectable, NotFoundException } from '@nestjs/common';
import type { ArticleDetail, ArticleSummary, Paginated } from '@cmnews/shared';
import { decodeCursor, encodeCursor, isTimeCursor } from '../../common/cursor';
import { DatabaseService } from '../../infrastructure/database/database.service';

export interface ListFilters {
  nicheId: number;
  category?: string;
  source?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
}

export interface SummaryRow {
  id: string;
  title: string;
  description: string | null;
  original_url: string;
  source_name: string;
  source_domain: string;
  published_at: Date;
  image_url: string | null;
  categories: string[] | null;
}

export const SUMMARY_COLUMNS = `
  a.id, a.title, a.description, a.original_url, a.source_name, a.source_domain, a.published_at, a.image_url,
  COALESCE((SELECT array_agg(c.slug ORDER BY c.sort_order)
              FROM article_categories ac JOIN categories c ON c.id = ac.category_id AND c.enabled
             WHERE ac.article_id = a.id), '{}') AS categories`;

export function toSummary(r: SummaryRow): ArticleSummary {
  return {
    id: String(r.id),
    title: r.title,
    description: r.description,
    url: r.original_url,
    sourceName: r.source_name,
    sourceDomain: r.source_domain,
    publishedAt: new Date(r.published_at).toISOString(),
    categories: r.categories ?? [],
    imageUrl: r.image_url,
  };
}

/**
 * The category filter compares category_id against a one-row subquery rather than joining
 * categories by slug: the planner then walks the public feed index newest-first and stops after
 * one page (politics: 26 ms -> 0.2 ms on 29k articles) instead of sorting the whole category.
 *
 * Browsing endpoints (latest, by category, by source, by date) read PostgreSQL directly with
 * keyset pagination on (published_at, id). They stay available even if OpenSearch is down.
 * Only `status = 'accepted'` articles are ever returned.
 */
@Injectable()
export class NewsService {
  constructor(private readonly db: DatabaseService) {}

  async list(f: ListFilters): Promise<Paginated<ArticleSummary>> {
    const cursor = decodeCursor(f.cursor, isTimeCursor);
    const rows = await this.db.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS}
         FROM articles a
        WHERE a.niche_id = $1 AND a.status = 'accepted'
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
      [
        f.nicheId,
        f.category ?? null,
        f.source ?? null,
        f.from?.toISOString() ?? null,
        f.to?.toISOString() ?? null,
        cursor?.p ?? null,
        cursor?.i ?? '0',
        f.limit + 1,
      ],
    );
    const page = rows.slice(0, f.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toSummary),
      nextCursor:
        rows.length > f.limit && last ? encodeCursor({ p: new Date(last.published_at).toISOString(), i: String(last.id) }) : null,
    };
  }

  async getById(nicheId: number, id: string): Promise<ArticleDetail> {
    const row = await this.db.one<
      SummaryRow & { language: string; source_country: string | null; author: string | null; first_seen_at: Date }
    >(
      `SELECT ${SUMMARY_COLUMNS}, a.language, a.source_country, a.author, a.first_seen_at
         FROM articles a
        WHERE a.id = $1 AND a.niche_id = $2 AND a.status = 'accepted'`,
      [id, nicheId],
    );
    if (!row) throw new NotFoundException({ code: 'article_not_found', message: 'Article not found' });
    // Syndicated copies / near duplicates point at this article; show them as extra coverage.
    const related = await this.db.query<{
      id: string;
      title: string;
      original_url: string;
      source_name: string;
      source_domain: string;
      published_at: Date;
    }>(
      `SELECT DISTINCT ON (source_domain) id, title, original_url, source_name, source_domain, published_at
         FROM articles
        WHERE duplicate_of_id = $1 AND status = 'duplicate' AND source_domain <> $2
          AND quality_status <> 'rejected' AND relevance_status <> 'irrelevant'
        ORDER BY source_domain, published_at
        LIMIT 20`,
      [id, row.source_domain],
    );
    return {
      ...toSummary(row),
      language: row.language,
      sourceCountry: row.source_country,
      author: row.author,
      firstSeenAt: new Date(row.first_seen_at).toISOString(),
      alsoReportedBy: related.map((r) => ({
        id: String(r.id),
        title: r.title,
        url: r.original_url,
        sourceName: r.source_name,
        sourceDomain: r.source_domain,
        publishedAt: new Date(r.published_at).toISOString(),
      })),
    };
  }

  async summariesByIds(ids: string[]): Promise<Map<string, ArticleSummary>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM articles a WHERE a.id = ANY($1::bigint[]) AND a.status = 'accepted'`,
      [ids],
    );
    return new Map(rows.map((r) => [String(r.id), toSummary(r)]));
  }
}
