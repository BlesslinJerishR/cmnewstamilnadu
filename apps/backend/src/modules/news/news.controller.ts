import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import type { ArticleDetail, ArticleSummary, Paginated, SearchResponse } from '@cmnews/shared';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { sha256 } from '../../common/text';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { NichesService } from '../niches/niches.service';
import { SearchService } from '../search/search.service';
import { NewsService } from './news.service';
import {
  ByDateQuery,
  byDateQuerySchema,
  idParamSchema,
  ListQuery,
  listQuerySchema,
  nicheOnlySchema,
  SearchQuery,
  searchQuerySchema,
  slugParamSchema,
  suggestQuerySchema,
} from './news.schemas';

const LIST_TTL = 60;
const SEARCH_TTL = 60;
const DETAIL_TTL = 300;

function key(prefix: string, params: unknown): string {
  return `${prefix}:${sha256(JSON.stringify(params)).slice(0, 32)}`;
}

@Controller('news')
export class NewsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly news: NewsService,
    private readonly search: SearchService,
    private readonly niches: NichesService,
    private readonly cache: CacheService,
  ) {}

  private nicheId(slug?: string): Promise<number> {
    return this.niches.resolvePublicNicheId(slug ?? this.config.DEFAULT_NICHE);
  }

  @Get()
  async list(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery): Promise<Paginated<ArticleSummary>> {
    const nicheId = await this.nicheId(q.niche);
    return this.cache.wrap(key('news:list', { nicheId, ...q }), LIST_TTL, () =>
      this.news.list({ nicheId, category: q.category, source: q.source, from: q.from, to: q.to, cursor: q.cursor, limit: q.limit }),
    );
  }

  @Get('latest')
  async latest(@Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery): Promise<Paginated<ArticleSummary>> {
    const nicheId = await this.nicheId(q.niche);
    return this.cache.wrap(key('news:latest', { nicheId, cursor: q.cursor, limit: q.limit }), LIST_TTL, () =>
      this.news.list({ nicheId, cursor: q.cursor, limit: q.limit }),
    );
  }

  @Get('search')
  async searchNews(@Query(new ZodValidationPipe(searchQuerySchema)) q: SearchQuery): Promise<SearchResponse> {
    const nicheSlug = q.niche ?? this.config.DEFAULT_NICHE;
    const nicheId = await this.nicheId(nicheSlug);
    const run = () =>
      this.search.search({
        nicheSlug,
        nicheId,
        q: q.q,
        category: q.category,
        source: q.source,
        from: q.from,
        to: q.to,
        sort: q.sort,
        cursor: q.cursor,
        limit: q.limit,
      });
    // Degraded (fallback) results are not cached so normal search resumes as soon as possible.
    return this.cache.wrap(key('news:search', { nicheSlug, ...q, q: q.q.toLowerCase() }), SEARCH_TTL, run, (r) => !r.degraded);
  }

  @Get('suggest')
  async suggest(@Query(new ZodValidationPipe(suggestQuerySchema)) q: { q: string; niche?: string }): Promise<{ suggestions: string[] }> {
    const nicheSlug = q.niche ?? this.config.DEFAULT_NICHE;
    await this.nicheId(nicheSlug);
    return this.cache.wrap(key('news:suggest', { nicheSlug, q: q.q.toLowerCase() }), SEARCH_TTL, async () => ({
      suggestions: await this.search.suggest(nicheSlug, q.q),
    }));
  }

  @Get('by-category/:slug')
  async byCategory(
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
    @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery,
  ): Promise<Paginated<ArticleSummary>> {
    const nicheId = await this.nicheId(q.niche);
    return this.cache.wrap(key('news:category', { nicheId, slug, cursor: q.cursor, limit: q.limit }), LIST_TTL, () =>
      this.news.list({ nicheId, category: slug, cursor: q.cursor, limit: q.limit }),
    );
  }

  /** Articles published on a calendar day in Indian Standard Time. */
  @Get('by-date')
  async byDate(@Query(new ZodValidationPipe(byDateQuerySchema)) q: ByDateQuery): Promise<Paginated<ArticleSummary>> {
    const nicheId = await this.nicheId(q.niche);
    const from = new Date(`${q.date}T00:00:00+05:30`);
    if (Number.isNaN(from.getTime())) return { items: [], nextCursor: null };
    const to = new Date(from.getTime() + 24 * 3600 * 1000);
    return this.cache.wrap(key('news:date', { nicheId, date: q.date, cursor: q.cursor, limit: q.limit }), LIST_TTL, () =>
      this.news.list({ nicheId, from, to, cursor: q.cursor, limit: q.limit }),
    );
  }

  @Get(':id')
  async detail(
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
    @Query(new ZodValidationPipe(nicheOnlySchema)) q: { niche?: string },
  ): Promise<ArticleDetail> {
    const nicheId = await this.nicheId(q.niche);
    return this.cache.wrap(`news:detail:${nicheId}:${id}`, DETAIL_TTL, () => this.news.getById(nicheId, id));
  }
}
