import { Injectable } from '@nestjs/common';
import { Queryable } from '../../infrastructure/database/database.service';
import { NormalizedArticle } from '../processing/candidate';

export interface DuplicateMatch {
  duplicateOfId: string;
  reason:
    | 'same_title_same_source'
    | 'syndicated_same_title'
    | 'near_duplicate_same_source'
    | 'syndicated_near_duplicate';
  similarity: number;
}

/** Trigram similarity at or above which two headlines are treated as the same story. */
export const NEAR_DUPLICATE_SIMILARITY = 0.75;
/** Shorter headlines are too generic for fuzzy matching; they need an exact title hash match. */
export const NEAR_DUPLICATE_MIN_TITLE_LENGTH = 30;
/** Only articles published close together can be the same story. */
export const DUPLICATE_WINDOW_HOURS = 36;

/**
 * Levels 3-5 of deduplication (levels 1-2, the canonical URL hash, are enforced by the
 * UNIQUE (niche_id, url_hash) constraint before this runs):
 *   3. identical normalised title hash
 *   4. same source + same normalised title within the time window
 *   5. near-duplicate headline (pg_trgm similarity), which also detects syndicated copies
 *      of the same wire story published by different outlets.
 * The earliest stored article stays the representative; later copies point to it.
 */
const NUMBER_TOKEN = /\b\d+\b/g;

function numberTokens(title: string): string {
  return [...new Set(title.match(NUMBER_TOKEN) ?? [])].sort().join(' ');
}

/**
 * Deterministic guards for fuzzy (non-identical) headline matches:
 *  - headlines whose numbers differ describe different facts ("500 crore" vs "200 crore",
 *    "hospital 3" vs "hospital 4"), so they are never merged when both contain numbers;
 *  - a headline that names the niche anchor (the Chief Minister) is never hidden behind one
 *    that doesn't ("PM Modi congratulates" vs "CM Vijay congratulates").
 */
export function fuzzyMatchAllowed(candidateTitle: string, existingTitle: string, anchor: RegExp | null): boolean {
  const a = numberTokens(candidateTitle);
  const b = numberTokens(existingTitle);
  if (a && b && a !== b) return false;
  if (anchor && anchor.test(candidateTitle) && !anchor.test(existingTitle)) return false;
  return true;
}

@Injectable()
export class DeduplicationService {
  async findDuplicate(
    db: Queryable,
    nicheId: number,
    article: NormalizedArticle,
    candidateStatuses: Array<'accepted' | 'pending_review'>,
    excludeId: string | null = null,
    anchor: RegExp | null = null,
  ): Promise<DuplicateMatch | null> {
    const fuzzy = article.normalizedTitle.length >= NEAR_DUPLICATE_MIN_TITLE_LENGTH;
    const rows = await db.query<{ id: string; source_domain: string; normalized_title: string; exact: boolean; sim: number }>(
      `SELECT id, source_domain, normalized_title, (title_hash = $3) AS exact, similarity(normalized_title, $2)::float8 AS sim
         FROM articles
        WHERE niche_id = $1
          AND status = ANY($6::text[])
          AND duplicate_of_id IS NULL
          AND ($8::bigint IS NULL OR id <> $8::bigint)
          AND published_at BETWEEN $4::timestamptz - make_interval(hours => $5)
                               AND $4::timestamptz + make_interval(hours => $5)
          AND (title_hash = $3 OR ($7 AND normalized_title % $2))
        ORDER BY exact DESC, sim DESC, id ASC
        LIMIT 5`,
      [nicheId, article.normalizedTitle, article.titleHash, article.publishedAt.toISOString(), DUPLICATE_WINDOW_HOURS, candidateStatuses, fuzzy, excludeId],
    );
    for (const row of rows) {
      const sameSource = row.source_domain === article.sourceDomain;
      if (row.exact) {
        return { duplicateOfId: row.id, reason: sameSource ? 'same_title_same_source' : 'syndicated_same_title', similarity: 1 };
      }
      if (row.sim >= NEAR_DUPLICATE_SIMILARITY && fuzzyMatchAllowed(article.normalizedTitle, row.normalized_title, anchor)) {
        return {
          duplicateOfId: row.id,
          reason: sameSource ? 'near_duplicate_same_source' : 'syndicated_near_duplicate',
          similarity: Math.round(row.sim * 1000) / 1000,
        };
      }
    }
    return null;
  }
}
