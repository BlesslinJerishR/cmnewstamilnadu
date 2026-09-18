import { Injectable } from '@nestjs/common';
import type { Source } from '@cmnews/shared';
import { DatabaseService } from '../../infrastructure/database/database.service';

export interface SourceRecord {
  id: number;
  domain: string;
  name: string;
  country: string | null;
  status: 'active' | 'trusted' | 'blocked';
  trustWeight: number;
}

interface SourceRow {
  id: number;
  domain: string;
  name: string;
  country: string | null;
  status: SourceRecord['status'];
  trust_weight: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class SourcesService {
  private readonly cache = new Map<string, { record: SourceRecord; at: number }>();

  constructor(private readonly db: DatabaseService) {}

  private map(r: SourceRow): SourceRecord {
    return { id: r.id, domain: r.domain, name: r.name, country: r.country, status: r.status, trustWeight: r.trust_weight };
  }

  /** Finds or registers the publisher for a domain. New publishers start as "active". */
  async resolve(domain: string, country: string | null): Promise<SourceRecord> {
    const hit = this.cache.get(domain);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.record;
    const rows = await this.db.query<SourceRow>(
      `INSERT INTO sources (domain, name, country, homepage_url)
       VALUES ($1, $1, $2, $3)
       ON CONFLICT (domain) DO UPDATE SET country = COALESCE(sources.country, EXCLUDED.country)
       RETURNING id, domain, name, country, status, trust_weight`,
      [domain, country, `https://${domain}/`],
    );
    const record = this.map(rows[0]);
    this.cache.set(domain, { record, at: Date.now() });
    return record;
  }

  invalidate(domain?: string): void {
    if (domain) this.cache.delete(domain);
    else this.cache.clear();
  }

  /** Public list: publishers with at least one accepted article in the niche. */
  async listPublic(nicheId: number): Promise<Source[]> {
    const rows = await this.db.query<{
      domain: string;
      name: string;
      country: string | null;
      homepage_url: string | null;
      article_count: string;
    }>(
      `SELECT s.domain, s.name, s.country, s.homepage_url, count(a.id) AS article_count
         FROM sources s
         JOIN articles a ON a.source_id = s.id AND a.status = 'accepted' AND a.niche_id = $1
        WHERE s.status <> 'blocked'
        GROUP BY s.id
        ORDER BY count(a.id) DESC, s.name
        LIMIT 500`,
      [nicheId],
    );
    return rows.map((r) => ({
      domain: r.domain,
      name: r.name,
      country: r.country,
      homepageUrl: r.homepage_url,
      articleCount: Number(r.article_count),
    }));
  }
}
