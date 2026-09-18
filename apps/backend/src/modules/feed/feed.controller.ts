import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { Category, FeedResponse, Source } from '@cmnews/shared';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { CategoriesService } from '../categories/categories.service';
import { nicheOnlySchema } from '../news/news.schemas';
import { NichesService } from '../niches/niches.service';
import { SourcesService } from '../sources/sources.service';
import { FeedService } from './feed.service';

@Controller()
export class FeedController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly feed: FeedService,
    private readonly categories: CategoriesService,
    private readonly sources: SourcesService,
    private readonly niches: NichesService,
    private readonly cache: CacheService,
  ) {}

  @Get('feed')
  async home(@Query(new ZodValidationPipe(nicheOnlySchema)) q: { niche?: string }): Promise<FeedResponse> {
    const nicheId = await this.niches.resolvePublicNicheId(q.niche ?? this.config.DEFAULT_NICHE);
    return this.cache.wrap(`feed:${nicheId}`, 120, () => this.feed.build(nicheId));
  }

  @Get('categories')
  async listCategories(): Promise<{ items: Category[] }> {
    return this.cache.wrap('categories', 600, async () => ({ items: await this.categories.listPublic() }));
  }

  @Get('sources')
  async listSources(@Query(new ZodValidationPipe(nicheOnlySchema)) q: { niche?: string }): Promise<{ items: Source[] }> {
    const nicheId = await this.niches.resolvePublicNicheId(q.niche ?? this.config.DEFAULT_NICHE);
    return this.cache.wrap(`sources:${nicheId}`, 600, async () => ({ items: await this.sources.listPublic(nicheId) }));
  }
}
