import { Injectable } from '@nestjs/common';
import type { FeedResponse, FeedSection } from '@cmnews/shared';
import { CategoriesService } from '../categories/categories.service';
import { NewsService } from '../news/news.service';

const LATEST_SIZE = 10;
const SECTION_SIZE = 6;

/**
 * Server-driven home feed: a "Latest" section plus one section per category flagged as a feed
 * section. The app renders whatever sections it receives, so the home screen can change
 * without an app release. Empty sections are omitted.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly news: NewsService,
    private readonly categories: CategoriesService,
  ) {}

  async build(nicheId: number): Promise<FeedResponse> {
    const cats = (await this.categories.listPublic()).filter((c) => c.isFeedSection);
    const latest = await this.news.list({ nicheId, limit: LATEST_SIZE });
    const sections: FeedSection[] = [{ key: 'latest', title: 'Latest', categorySlug: null, items: latest.items }];
    const perCategory = await Promise.all(
      cats.map(async (c) => ({ c, page: await this.news.list({ nicheId, category: c.slug, limit: SECTION_SIZE }) })),
    );
    for (const { c, page } of perCategory) {
      if (page.items.length > 0) sections.push({ key: c.slug, title: c.name, categorySlug: c.slug, items: page.items });
    }
    return { generatedAt: new Date().toISOString(), sections };
  }
}
