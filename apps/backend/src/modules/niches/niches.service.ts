import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { CategoryClassifier, CategoryField } from '../categories/category.classifier';
import {
  DEFAULT_RELEVANCE_CONFIG,
  RelevanceConfig,
  RelevanceEngine,
  RelevanceField,
  RelevanceRule,
} from '../relevance/relevance.engine';
import {
  SEED_CATEGORIES,
  SEED_NICHE,
  SEED_QUERIES,
  SEED_RELEVANCE_RULES,
  SEED_SOURCES,
  TRUSTED_SOURCE_WEIGHT,
} from './seed-data';

export interface Niche {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  acceptThreshold: number;
  reviewThreshold: number;
  relevanceConfig: Partial<RelevanceConfig>;
}

export interface PipelineContext {
  niche: Niche;
  relevance: RelevanceEngine;
  classifier: CategoryClassifier;
  queryWeights: Map<number, number>;
  /** Niche anchor (e.g. /\bvijay\b/) applied to match text; null when the niche has none. */
  anchor: RegExp | null;
  loadedAt: number;
}

interface NicheRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  accept_threshold: number;
  review_threshold: number;
  relevance_config: Partial<RelevanceConfig>;
}

const CONTEXT_TTL_MS = 60_000;

function mapNiche(r: NicheRow): Niche {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    acceptThreshold: r.accept_threshold,
    reviewThreshold: r.review_threshold,
    relevanceConfig: r.relevance_config ?? {},
  };
}

@Injectable()
export class NichesService {
  private readonly logger = new Logger(NichesService.name);
  private readonly contexts = new Map<number, PipelineContext>();

  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<Niche[]> {
    return (await this.db.query<NicheRow>('SELECT * FROM niches ORDER BY id')).map(mapNiche);
  }

  private readonly slugMemo = new Map<string, { id: number; at: number }>();

  /** Public-facing niche lookup (enabled niches only), memoised for a minute. */
  async resolvePublicNicheId(slug: string): Promise<number> {
    const hit = this.slugMemo.get(slug);
    if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.id;
    const row = await this.db.one<{ id: number }>('SELECT id FROM niches WHERE slug = $1 AND enabled', [slug]);
    if (!row) throw new NotFoundException({ code: 'unknown_niche', message: `Unknown niche "${slug}"` });
    this.slugMemo.set(slug, { id: row.id, at: Date.now() });
    return row.id;
  }

  async getBySlug(slug: string): Promise<Niche> {
    const row = await this.db.one<NicheRow>('SELECT * FROM niches WHERE slug = $1', [slug]);
    if (!row) throw new NotFoundException(`Unknown niche "${slug}"`);
    return mapNiche(row);
  }

  async getById(id: number): Promise<Niche> {
    const row = await this.db.one<NicheRow>('SELECT * FROM niches WHERE id = $1', [id]);
    if (!row) throw new NotFoundException(`Unknown niche ${id}`);
    return mapNiche(row);
  }

  /** Drops cached rule engines so the next article uses freshly edited rules. */
  invalidate(nicheId?: number): void {
    this.slugMemo.clear();
    if (nicheId === undefined) this.contexts.clear();
    else this.contexts.delete(nicheId);
  }

  async pipelineContext(nicheId: number): Promise<PipelineContext> {
    const cached = this.contexts.get(nicheId);
    if (cached && Date.now() - cached.loadedAt < CONTEXT_TTL_MS) return cached;

    const niche = await this.getById(nicheId);
    const ruleRows = await this.db.query<{
      id: number;
      name: string;
      rule_type: RelevanceRule['ruleType'];
      pattern: string;
      pattern_b: string | null;
      max_distance: number | null;
      fields: RelevanceField[];
      weight: number;
    }>('SELECT * FROM relevance_rules WHERE niche_id = $1 AND enabled ORDER BY id', [nicheId]);

    const rules: RelevanceRule[] = [];
    for (const r of ruleRows) {
      const rule: RelevanceRule = {
        id: r.id,
        name: r.name,
        ruleType: r.rule_type,
        pattern: r.pattern,
        patternB: r.pattern_b,
        maxDistance: r.max_distance,
        fields: r.fields,
        weight: r.weight,
      };
      try {
        new RelevanceEngine([rule], this.relevanceConfig(niche));
        rules.push(rule);
      } catch (err) {
        this.logger.error(`Skipping invalid relevance rule ${r.name}: ${(err as Error).message}`);
      }
    }

    const queryRows = await this.db.query<{ id: number; relevance_weight: number }>(
      'SELECT id, relevance_weight FROM gdelt_queries WHERE niche_id = $1',
      [nicheId],
    );

    const categories = await this.db.query<{ id: number; slug: string; min_score: number }>(
      'SELECT id, slug, min_score FROM categories WHERE enabled ORDER BY sort_order',
    );
    const categoryRules = await this.db.query<{
      category_id: number;
      rule_type: 'phrase' | 'regex';
      pattern: string;
      fields: CategoryField[];
      weight: number;
    }>('SELECT category_id, rule_type, pattern, fields, weight FROM category_rules WHERE enabled');

    const ctx: PipelineContext = {
      niche,
      relevance: new RelevanceEngine(rules, this.relevanceConfig(niche)),
      classifier: new CategoryClassifier(
        categories.map((c) => ({ id: c.id, slug: c.slug, minScore: c.min_score })),
        categoryRules.map((r) => ({
          categoryId: r.category_id,
          ruleType: r.rule_type,
          pattern: r.pattern,
          fields: r.fields,
          weight: r.weight,
        })),
      ),
      queryWeights: new Map(queryRows.map((q) => [q.id, q.relevance_weight])),
      anchor: this.relevanceConfig(niche).anchorPattern ? new RegExp(this.relevanceConfig(niche).anchorPattern, 'u') : null,
      loadedAt: Date.now(),
    };
    this.contexts.set(nicheId, ctx);
    return ctx;
  }

  relevanceConfig(niche: Niche): RelevanceConfig {
    const c = niche.relevanceConfig ?? {};
    return {
      ...DEFAULT_RELEVANCE_CONFIG,
      ...c,
      fieldMultipliers: { ...DEFAULT_RELEVANCE_CONFIG.fieldMultipliers, ...(c.fieldMultipliers ?? {}) },
      countryBoosts: { ...DEFAULT_RELEVANCE_CONFIG.countryBoosts, ...(c.countryBoosts ?? {}) },
      acceptThreshold: niche.acceptThreshold,
      reviewThreshold: niche.reviewThreshold,
    };
  }

  /** Additive, idempotent seed of the first niche and shared categories/sources. */
  async seed(): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO niches (slug, name, description, accept_threshold, review_threshold, relevance_config)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING`,
        [SEED_NICHE.slug, SEED_NICHE.name, SEED_NICHE.description, SEED_NICHE.acceptThreshold, SEED_NICHE.reviewThreshold, JSON.stringify(SEED_NICHE.relevanceConfig)],
      );
      const [{ id: nicheId }] = await tx.query<{ id: number }>('SELECT id FROM niches WHERE slug = $1', [SEED_NICHE.slug]);

      for (const q of SEED_QUERIES) {
        await tx.query(
          `INSERT INTO gdelt_queries (niche_id, name, query_text, priority, window_minutes, relevance_weight)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (niche_id, name) DO NOTHING`,
          [nicheId, q.name, q.queryText, q.priority, q.windowMinutes, q.relevanceWeight],
        );
      }
      for (const r of SEED_RELEVANCE_RULES) {
        await tx.query(
          `INSERT INTO relevance_rules (niche_id, name, rule_type, pattern, pattern_b, max_distance, fields, weight, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (niche_id, name) DO NOTHING`,
          [nicheId, r.name, r.ruleType, r.pattern, r.patternB ?? null, r.maxDistance ?? null, r.fields, r.weight, r.notes],
        );
      }
      for (const c of SEED_CATEGORIES) {
        await tx.query(
          `INSERT INTO categories (slug, name, description, sort_order, is_feed_section, min_score)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING`,
          [c.slug, c.name, c.description, c.sortOrder, c.isFeedSection, c.minScore],
        );
        const [{ id: categoryId }] = await tx.query<{ id: number }>('SELECT id FROM categories WHERE slug = $1', [c.slug]);
        for (const keyword of c.keywords) {
          await tx.query(
            `INSERT INTO category_rules (category_id, rule_type, pattern) VALUES ($1, 'phrase', $2)
             ON CONFLICT (category_id, rule_type, pattern) DO NOTHING`,
            [categoryId, keyword],
          );
        }
      }
      for (const s of SEED_SOURCES) {
        await tx.query(
          `INSERT INTO sources (domain, name, country, status, trust_weight, homepage_url)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (domain) DO NOTHING`,
          [s.domain, s.name, s.country, s.trusted ? 'trusted' : 'active', s.trusted ? TRUSTED_SOURCE_WEIGHT : 0, `https://${s.domain}/`],
        );
      }
    });
    this.invalidate();
  }
}
